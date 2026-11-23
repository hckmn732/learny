"""Deferred correction of the open answers of a validation attempt (SPEC-611 ET-8, CL-6).

Port of `packages/services/src/quiz/grade-open.ts`: one structured tutor call per pending open
answer, three attempts per answer (ADR-0017), then the answer stays pending and the learner is
notified. The learner text and the expected elements are escaped before they enter the prompt, so
they can never define an instruction. The grader is an injected port: the integration suite passes
a deterministic one and the default reads the committed fixture (`LLM_MODE=mock`).
"""

import json
from collections.abc import Awaitable, Callable, Mapping
from typing import Annotated, Any, cast

from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import text

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.application.quiz_submit import items_of, points_of
from learny.assessments.domain.bricks.schema import parse_payload
from learny.assessments.infrastructure import queries
from learny.engagement import public as engagement
from learny.identity.domain.actor import Actor
from learny.platform.llm.tasks import AiTask
from learny.platform.llm.types import StepInput, SystemPart
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts

TUTOR_TASK: AiTask = "tutor"
GRADING_ATTEMPTS = 3
"""ADR-0017 - three attempts per answer, then the answer stays pending."""
CORRECT_RATIO = 0.6
"""The threshold above which the tutor answer counts as exact."""
RETRYABLE_CODES = (
    "AI_UNAVAILABLE",
    "AI_TASK_FAILED",
    "INVALID_OUTPUT",
    "MOCK_FIXTURE_NOT_FOUND",
    "SERVICE_UNAVAILABLE",
)

UPDATE_OPEN_ANSWER = text(
    """
    update public.answers
    set is_correct = :is_correct,
        score = :score,
        max_score = :max_score,
        graded_by = 'tutor',
        feedback = cast(:feedback as jsonb)
    where id = cast(:answer_id as uuid)
    """
)


class OpenGradeCriterion(BaseModel):
    """One graded criterion of the tutor answer."""

    key: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] | None = (
        None
    )
    ok: bool
    comment: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class OpenGrade(BaseModel):
    """`OpenGradeSchema`: a bounded score, the criteria and the missing elements."""

    score: float = Field(ge=0, le=1)
    explanation: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4_000)]
    criteria: list[OpenGradeCriterion] = Field(max_length=20)
    missing: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]] = (
        Field(max_length=20)
    )
    offTopic: bool = False


OpenAnswerGrader = Callable[[Mapping[str, Any], Mapping[str, Any]], Awaitable[OpenGrade]]


def escape_data(value: str) -> str:
    """The learner text is data: the three XML-significant characters are escaped."""
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def prompt_of(item: Mapping[str, Any], response: str) -> str:
    """The user prompt of one answer, verbatim from `promptOf` in TypeScript."""
    payload, _ = parse_payload("open_question", item.get("payload"))
    expected = [] if payload is None else list(payload["expectedElements"])
    criteria = [] if payload is None else list(payload["criteria"])
    lines = [
        texts.OPEN_GRADE_HEADER,
        texts.OPEN_GRADE_NOTION.format(notion=item.get("notionLabel") or ""),
        texts.OPEN_GRADE_STEM.format(stem="" if payload is None else payload["stem"]),
        "",
        texts.OPEN_GRADE_EXPECTED_HEADER,
        *(
            texts.OPEN_GRADE_EXPECTED_ITEM.format(index=index + 1, element=element)
            for index, element in enumerate(expected)
        ),
        "",
        texts.OPEN_GRADE_CRITERIA_HEADER,
        *(
            texts.OPEN_GRADE_CRITERION.format(
                key=criterion["key"],
                label=criterion["label"],
                points=criterion["points"],
            )
            for criterion in criteria
        ),
        "",
        texts.OPEN_GRADE_MODEL_HEADER,
        "" if payload is None else str(payload["modelAnswer"]),
        "",
        texts.OPEN_GRADE_LEARNER_HEADER,
        texts.OPEN_GRADE_LEARNER_TAG.format(response=escape_data(response)),
        "",
        *texts.OPEN_GRADE_INSTRUCTIONS,
    ]
    return "\n".join(lines)


def prompt_input(item: Mapping[str, Any], response: str) -> StepInput:
    """The `StepInput` of the tutor correction: one cached system part and one user message."""
    return StepInput(
        system=(SystemPart(text=texts.OPEN_GRADE_SYSTEM_PROMPT, cache=True),),
        messages=({"role": "user", "content": prompt_of(item, response)},),
    )


async def default_open_answer_grader(
    deps: AssessmentDeps,
    context: Mapping[str, Any],
    item: Mapping[str, Any],
) -> OpenGrade:
    """The structured tutor correction through the gateway (`LLM_MODE=mock` in tests)."""
    generated = await deps.llm.object(
        TUTOR_TASK,
        texts.OPEN_GRADE_PROMPT_ID,
        OpenGrade,
        prompt_input(item, str(context["response"])),
        scenario=context.get("scenario") or texts.OPEN_GRADE_SCENARIO,
    )
    return cast(OpenGrade, generated)


def text_of(response: Any) -> str:
    """`textOf`: the trimmed `text` field of an answer response, empty otherwise."""
    if isinstance(response, Mapping):
        value = response.get("text")
        return value.strip() if isinstance(value, str) else ""
    return ""


def _is_retryable(error: AppError) -> bool:
    return error.code in RETRYABLE_CODES


async def notify_tutor_failure(
    deps: AssessmentDeps, user_id: str, formation_id: str, attempt_id: str
) -> None:
    """One in-app notification with a stable dedupe key, exactly like `notifyTutorFailure`."""
    await engagement.notify(
        deps,  # type: ignore[arg-type]
        user_id=user_id,
        notification_type="ai_task_failed",
        formation_id=formation_id,
        data={
            "taskLabel": texts.QUIZ_GRADE_TASK_LABEL,
            "modelLabel": texts.QUIZ_GRADE_MODEL_LABEL,
            "subject": texts.QUIZ_GRADE_SUBJECT,
        },
        dedupe_key=f"ai_task_failed:quiz-grade:{attempt_id}",
    )


async def grade_open_answers(
    deps: AssessmentDeps,
    user_id: str,
    attempt_id: str,
    *,
    grader: OpenAnswerGrader | None = None,
    scenario: str | None = None,
) -> dict[str, Any]:
    """ET-8 step 1 - corrects every pending open answer; three attempts per answer (ADR-0017)."""
    actor = Actor(user_id=user_id, email="", email_confirmed=True, transport="bearer")
    async with deps.db.user_tx(actor) as tx:
        attempt = await queries.read_submit_attempt(tx, user_id, attempt_id)
        if attempt is None:
            raise AppError("NOT_FOUND", texts.QUIZ_ATTEMPT_NOT_FOUND)
        if attempt["status"] not in ("submitted", "graded"):
            raise AppError("CONFLICT", texts.QUIZ_NOT_SUBMITTED, status=409)
        items = items_of(attempt["items"])
        answers = await queries.read_submit_answers(tx, attempt_id)
        formation_id = str(attempt["formation_id"])

    open_answers = [
        answer
        for answer in answers
        if answer["position"] - 1 < len(items)
        and items[answer["position"] - 1].get("type") == "open_question"
        and answer["is_correct"] is None
        and answer["graded_by"] is None
    ]
    if not open_answers:
        return {"graded": 0, "pending": 0, "failed": False}

    grade_it = grader if grader is not None else _default_grader(deps)
    graded = 0
    failed = False
    for answer in open_answers:
        item = items[answer["position"] - 1]
        incoming = {
            "brickVersionId": str(answer["brick_version_id"]),
            "notionLabel": item.get("notionLabel") or "Notion",
            "type": "open_question",
            "payload": item.get("payload"),
            "response": text_of(answer["response"]),
            "scenario": scenario,
        }
        grade: OpenGrade | None = None
        last_error: AppError | None = None
        for _attempt in range(1, GRADING_ATTEMPTS + 1):
            try:
                grade = await grade_it(incoming, item)
                break
            except AppError as error:
                last_error = error
                if not _is_retryable(error):
                    break
        if grade is None:
            failed = True
            logger = getattr(deps, "logger", None)
            if logger is not None:
                logger.warn(
                    "quiz.grade-open.failed",
                    outcome="ai_task_failed",
                    code="AI_UNAVAILABLE" if last_error is None else last_error.code,
                )
            continue

        ratio = min(max(float(grade.score), 0.0), 1.0)
        max_score = points_of(answer)
        points = round(ratio * max_score * 100) / 100
        is_correct = ratio >= CORRECT_RATIO
        feedback = {
            "isCorrect": is_correct,
            "title": (texts.GRADE_FEEDBACK_EXACT if is_correct else texts.GRADE_FEEDBACK_APPROXIMATE),
            "explanation": grade.explanation,
            "offTopic": grade.offTopic,
            "criteria": [criterion.model_dump() for criterion in grade.criteria],
            "missing": list(grade.missing),
            "correction": {
                "kind": "open_question",
                "explanation": grade.explanation,
                "criteria": [criterion.model_dump() for criterion in grade.criteria],
                "missing": list(grade.missing),
            },
        }
        async with deps.db.user_tx(actor) as tx:
            await tx.conn.execute(
                UPDATE_OPEN_ANSWER,
                {
                    "answer_id": answer["id"],
                    "is_correct": is_correct,
                    "score": points,
                    "max_score": max_score,
                    "feedback": json.dumps(feedback, ensure_ascii=False),
                },
            )
        graded += 1

    if failed:
        await notify_tutor_failure(deps, user_id, formation_id, attempt_id)
    return {
        "graded": graded,
        "pending": len(open_answers) - graded if failed else 0,
        "failed": failed,
    }


def _default_grader(deps: AssessmentDeps) -> OpenAnswerGrader:
    async def grade(context: Mapping[str, Any], item: Mapping[str, Any]) -> OpenGrade:
        return await default_open_answer_grader(deps, context, item)

    return grade


__all__ = [
    "GRADING_ATTEMPTS",
    "OpenAnswerGrader",
    "OpenGrade",
    "OpenGradeCriterion",
    "default_open_answer_grader",
    "escape_data",
    "grade_open_answers",
    "notify_tutor_failure",
    "prompt_input",
    "prompt_of",
    "text_of",
]
