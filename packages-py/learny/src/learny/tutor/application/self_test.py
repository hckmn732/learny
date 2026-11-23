"""Teste-moi: one open question, a bounded verdict and the mastery application (SPEC-610 ET-7).

Port of `packages/services/src/tutor-chat/self-test.ts` (BR-TUT-04, ADR-0174): the question is an
`open_question` brick wrapped in a `self_test` activity, the answer is written before the correction,
and `apply_learning_result` owns every mastery, FSRS and gap write (SPEC-411). Each transaction is
short and closed before the model calls.
"""

import math
from collections.abc import Mapping, Sequence
from typing import Any, cast
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field

from learny.assessments.domain.bricks.validate import (
    BrickInvalid,
    BrickResourceInfo,
    validate_brick,
)
from learny.identity.domain.actor import Actor
from learny.learning.public import apply_learning_result
from learny.shared.errors import AppError
from learny.shared.locale_fr import tutor as texts
from learny.shared.time import from_epoch_ms, to_epoch_ms, to_iso, user_day_bounds, user_local_day
from learny.tutor.application.conversations import (
    ConversationRef,
    as_record,
    conversation_messages,
    json_text,
    message_dto,
    self_test_of,
)
from learny.tutor.application.llm import (
    SELF_TEST_GRADE_PROMPT_ID,
    SELF_TEST_QUESTION_PROMPT_ID,
    TUTOR_TASK,
    step_input,
)
from learny.tutor.application.ports import TutorDeps
from learny.tutor.domain.prompts import build_self_test_grade_prompt, build_self_test_question_prompt
from learny.tutor.domain.turn import mock_grade_scenario
from learny.tutor.infrastructure import queries

DEFAULT_TONE = "vous"
DEFAULT_LANGUAGE = "fr"
PASSING_SCORE = 0.6
QUESTION_MAX = 600


class SelfTestGrade(BaseModel):
    """`SELF_TEST_GRADE_SCHEMA`: a bounded score and a short feedback (ADR-0174)."""

    model_config = ConfigDict(
        extra="forbid", json_schema_extra={"description": texts.SELF_TEST_GRADE_DESCRIPTION}
    )

    score: float = Field(ge=0, le=1)
    feedback: str = Field(min_length=1, max_length=1_000)


class _Resolver:
    """The reference reader of `validate_brick`, limited to the caller's own rows."""

    def __init__(self, deps: TutorDeps, actor: Actor) -> None:
        self._deps = deps
        self._actor = actor

    async def existing_notion_ids(self, formation_id: str, ids: Sequence[str]) -> set[str]:
        async with self._deps.db.user_tx(self._actor) as tx:
            found = await queries.rows(
                tx,
                queries.NOTIONS_OF_FORMATION,
                {"formation_id": formation_id, "ids": list(ids)},
            )
        return {str(row["id"]) for row in found}

    async def chunks(self, ids: Sequence[str]) -> dict[str, dict[str, str]]:
        async with self._deps.db.user_tx(self._actor) as tx:
            found = await queries.rows(
                tx, queries.CHUNKS_OF_OWNER, {"user_id": self._actor.user_id, "ids": list(ids)}
            )
        return {str(row["id"]): {"resourceId": str(row["resource_id"])} for row in found}

    async def resources(self, ids: Sequence[str]) -> dict[str, BrickResourceInfo]:
        async with self._deps.db.user_tx(self._actor) as tx:
            found = await queries.rows(
                tx, queries.RESOURCES_OF_OWNER, {"user_id": self._actor.user_id, "ids": list(ids)}
            )
        return {
            str(row["id"]): BrickResourceInfo(
                kind=str(row["kind"]),
                pages=row["pages"],
                durationSec=row["duration_sec"],
                deleted=row["deleted_at"] is not None,
            )
            for row in found
        }

    async def existing_brick_ids(self, formation_id: str, ids: Sequence[str]) -> set[str]:
        async with self._deps.db.user_tx(self._actor) as tx:
            found = await queries.rows(
                tx,
                queries.BRICKS_OF_OWNER,
                {
                    "user_id": self._actor.user_id,
                    "formation_id": formation_id,
                    "ids": list(ids),
                },
            )
        return {str(row["id"]) for row in found}


def _js_round(value: float) -> int:
    """`Math.round`: half up, never banker's rounding."""
    return math.floor(value + 0.5)


def open_question_payload(question: str, notion_label: str) -> dict[str, Any]:
    """`OPEN_QUESTION_PAYLOAD`: the brick payload of the asked question."""
    return {
        "stem": question,
        "expectedElements": [texts.OPEN_QUESTION_EXPECTED.format(label=notion_label)],
        "criteria": [
            {
                "key": "idee",
                "label": texts.OPEN_QUESTION_CRITERION.format(label=notion_label),
                "points": 10,
                "description": "",
            }
        ],
        "answerMaxChars": 1_500,
        "modelAnswer": texts.OPEN_QUESTION_MODEL_ANSWER.format(label=notion_label),
        "explanation": texts.OPEN_QUESTION_EXPLANATION.format(label=notion_label),
        "objective": texts.OPEN_QUESTION_OBJECTIVE.format(label=notion_label),
        "sources": [],
    }


async def question_of(
    deps: TutorDeps,
    profile: Mapping[str, str],
    notion_label: str,
    context_block: str,
    scenario: str,
) -> str:
    """`questionOf`: one model step, then the bounded question text."""
    prompt = build_self_test_question_prompt(profile, notion_label, context_block)
    step = await deps.llm.step(
        TUTOR_TASK,
        SELF_TEST_QUESTION_PROMPT_ID,
        step_input(prompt),
        scenario=scenario,
    )
    text = step.text.strip()
    if text == "":
        raise AppError("AI_TASK_FAILED", texts.NO_QUESTION_ASKED)
    return text[:QUESTION_MAX]


async def create_self_test_attempt(
    deps: TutorDeps,
    actor: Actor,
    input: Mapping[str, Any],
) -> dict[str, str]:
    """`createSelfTestAttempt`: the brick, its version, the activity and the attempt, in one tx."""
    formation_id = str(input["formationId"])
    notion_id = str(input["notionId"])
    notion_label = str(input["notionLabel"])
    draft = {
        "type": "open_question",
        "formationId": formation_id,
        "purpose": "review",
        "notionIds": [notion_id],
        "origin": "tutor",
        "payload": open_question_payload(str(input["question"]), notion_label),
    }
    try:
        valid = await validate_brick(draft, _Resolver(deps, actor))
    except BrickInvalid as invalid:
        raise AppError(
            "VALIDATION_FAILED",
            texts.BRICK_NOT_CREATED,
            errors=[dict(issue) for issue in invalid.issues],
        ) from invalid
    async with deps.db.user_tx(actor) as tx:
        brick = await queries.one(
            tx,
            queries.INSERT_BRICK,
            {
                "user_id": actor.user_id,
                "formation_id": formation_id,
                "type": valid["type"],
                "notion_ids": [notion_id],
                "purpose": valid["purpose"],
            },
        )
        if brick is None:
            raise AppError("INTERNAL_ERROR", texts.BRICK_NOT_CREATED)
        brick_id = str(brick["id"])
        await queries.execute(
            tx,
            queries.INSERT_BRICK_VERSION,
            {
                "brick_id": brick_id,
                "payload": json_text(valid["payload"]),
                "fingerprint": valid["fingerprint"],
                "origin": valid["origin"],
            },
        )
        version = await queries.one(tx, queries.SELECT_BRICK_VERSION, {"brick_id": brick_id, "version": 1})
        if version is None:
            raise AppError("INTERNAL_ERROR", texts.BRICK_VERSION_MISSING)
        brick_version_id = str(version["id"])
        items = [{"brickId": brick_id, "brickVersionId": brick_version_id}]
        await queries.execute(
            tx,
            queries.ASSERT_ACTIVITY_ITEMS_OWNED,
            {
                "owner_id": actor.user_id,
                "formation_id": formation_id,
                "items": json_text(items),
            },
        )
        activity = await queries.one(
            tx,
            queries.INSERT_ACTIVITY,
            {
                "owner_id": actor.user_id,
                "formation_id": formation_id,
                "module_id": str(input["moduleId"]),
                "kind": "self_test",
                "items": json_text(items),
            },
        )
        if activity is None:
            raise AppError("INTERNAL_ERROR", texts.ACTIVITY_NOT_CREATED)
        activity_id = str(activity["id"])
        attempt = await create_attempt(deps, actor, activity_id)
    return {
        "activityId": activity_id,
        "brickId": brick_id,
        "brickVersionId": brick_version_id,
        "attemptId": attempt,
    }


async def create_attempt(deps: TutorDeps, actor: Actor, activity_id: str) -> str:
    """`createAttempt`: the next attempt number of a ready activity, serialised per activity."""
    async with deps.db.user_tx(actor) as tx:
        await queries.execute(tx, queries.LOCK_ATTEMPT_NUMBER, {"activity_id": activity_id})
        activity = await queries.one(
            tx,
            queries.READ_ACTIVITY_FOR_ATTEMPT,
            {"activity_id": activity_id, "user_id": actor.user_id},
        )
        if activity is None:
            raise AppError("NOT_FOUND", texts.ACTIVITY_NOT_FOUND)
        if activity["status"] != "ready":
            raise AppError("VALIDATION_FAILED", texts.ACTIVITY_NOT_READY)
        number = await queries.one(
            tx,
            queries.NEXT_ATTEMPT_NO,
            {"activity_id": activity_id, "user_id": actor.user_id},
        )
        attempt_no = 1 if number is None else int(number["attempt_no"])
        for _ in range(5):
            inserted = await queries.one(
                tx,
                queries.INSERT_ATTEMPT,
                {
                    "user_id": actor.user_id,
                    "activity_id": activity_id,
                    "attempt_no": attempt_no,
                },
            )
            if inserted is not None:
                return str(inserted["id"])
            again = await queries.one(
                tx,
                queries.NEXT_ATTEMPT_NO,
                {"activity_id": activity_id, "user_id": actor.user_id},
            )
            attempt_no = attempt_no + 1 if again is None else int(again["attempt_no"])
    raise AppError("INTERNAL_ERROR", texts.ATTEMPT_NOT_CREATED)


async def ask_self_test(
    deps: TutorDeps,
    actor: Actor,
    ref: ConversationRef,
    context: Mapping[str, Any],
    module_id: str,
) -> dict[str, Any]:
    """ET-7 - asks the pending question and returns the metadata stored on the tutor message."""
    notion_ids = list(context["notionIds"])
    notion_id = context["gapNotionId"] or (notion_ids[0] if notion_ids else None)
    if notion_id is None:
        raise AppError("VALIDATION_FAILED", texts.NO_NOTION_TO_TEST)
    labels = context["notionLabels"]
    notion_label = str(labels.get(notion_id) or texts.DEFAULT_NOTION_LABEL)
    async with deps.db.user_tx(actor) as tx:
        counted = await queries.one(tx, queries.COUNT_SELF_TESTS, {"conversation_id": ref.id})
    total = 0 if counted is None else int(counted["total"])
    scenario = "self-test-q1" if total % 2 == 0 else "self-test-q2"
    question = await question_of(
        deps,
        context["profile"],
        notion_label,
        str(context["promptBlock"]),
        scenario,
    )
    created = await create_self_test_attempt(
        deps,
        actor,
        {
            "formationId": context["formationId"],
            "moduleId": module_id,
            "notionId": notion_id,
            "notionLabel": notion_label,
            "question": question,
        },
    )
    return {
        "question": question,
        "pending": {
            **created,
            "notionId": notion_id,
            "notionLabel": notion_label,
            "question": question,
        },
    }


async def pending_self_test(
    deps: TutorDeps, actor: Actor, conversation_id: str
) -> tuple[dict[str, Any], dict[str, str]]:
    """`pendingSelfTest`: the last pending question of the conversation, with its row."""
    messages = await conversation_messages(deps, actor, conversation_id)
    for row in reversed(messages):
        if row.get("role") != "tutor" or row.get("self_test") is None:
            continue
        data = self_test_of(row.get("self_test"))
        if data is None or data["status"] != "pending":
            continue
        record = as_record(row["self_test"])
        return (
            {"id": str(row["id"]), "self_test": dict(record)},
            {
                "activityId": str(record["activityId"]),
                "brickId": str(record["brickId"]),
                "brickVersionId": str(record["brickVersionId"]),
                "attemptId": str(record["attemptId"]),
                "notionId": str(record["notionId"]),
                "notionLabel": str(record["notionLabel"]),
                "question": str(record["question"]),
            },
        )
    raise AppError("CONFLICT", texts.NO_PENDING_SELF_TEST)


async def global_quiz_time(deps: TutorDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """`globalQuizTime`: the next global quiz of the day, else the literal `demain`."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.one(
            tx,
            queries.GLOBAL_QUIZ_SLOT,
            {
                "user_id": actor.user_id,
                "formation_id": formation_id,
                "now": to_iso(deps.clock.now()),
            },
        )
    if row is None:
        return {"label": texts.TOMORROW, "today": False}
    instant = row["starts_at"]
    time_zone = str(row["timezone"])
    today = user_local_day(to_epoch_ms(instant), time_zone) == user_local_day(
        to_epoch_ms(deps.clock.now()), time_zone
    )
    local = instant.astimezone(ZoneInfo(time_zone))
    return {
        "label": f"{local.hour:02d}:{local.minute:02d}" if today else texts.TOMORROW,
        "today": today,
    }


async def grade_answer(
    deps: TutorDeps,
    actor: Actor,
    pending: Mapping[str, str],
    text: str,
    profile: Mapping[str, str],
) -> dict[str, Any]:
    """`gradeAnswer`: the bounded verdict of the model, then the answer row and the attempt."""
    prompt = build_self_test_grade_prompt(
        profile,
        str(pending["question"]),
        [texts.OPEN_QUESTION_EXPECTED.format(label=str(pending["notionLabel"]))],
        text,
    )
    graded = await deps.llm.object(
        TUTOR_TASK,
        SELF_TEST_GRADE_PROMPT_ID,
        SelfTestGrade,
        step_input(prompt),
        scenario=mock_grade_scenario(text),
    )
    verdict = cast(SelfTestGrade, graded)
    score = float(verdict.score)
    feedback = str(verdict.feedback)
    async with deps.db.user_tx(actor) as tx:
        await queries.execute(
            tx,
            queries.RECORD_ANSWER,
            {
                "attempt_id": pending["attemptId"],
                "brick_version_id": pending["brickVersionId"],
                "position": 1,
                "response": json_text({"text": text}),
                "is_correct": score >= PASSING_SCORE,
                "score": score,
                "max_score": 1,
                "graded_by": "tutor",
                "feedback": json_text({"explanation": feedback, "missing": []}),
            },
        )
        await queries.execute(
            tx,
            queries.UPDATE_ATTEMPT_GRADED,
            {
                "attempt_id": pending["attemptId"],
                "user_id": actor.user_id,
                "now": to_iso(deps.clock.now()),
                "score": score * 100,
                "passed": score >= PASSING_SCORE,
            },
        )
    return {"score": score, "feedback": feedback}


async def answer_self_test(deps: TutorDeps, actor: Actor, conversation_id: str, text: str) -> dict[str, Any]:
    """ET-7, CA-4 - grades the pending answer, applies the mastery and writes the correction."""
    row, pending = await pending_self_test(deps, actor, conversation_id)
    async with deps.db.user_tx(actor) as tx:
        meta = await queries.one(
            tx,
            queries.CONVERSATION_META,
            {"conversation_id": conversation_id, "user_id": actor.user_id},
        )
    if meta is None:
        raise AppError("NOT_FOUND", texts.CONVERSATION_NOT_FOUND)
    async with deps.db.user_tx(actor) as tx:
        profile_row = await queries.one(tx, queries.PROFILE_TONE, {"user_id": actor.user_id})
    profile = {
        "tone": DEFAULT_TONE if profile_row is None else str(profile_row["tutor_tone"]),
        "courseLanguage": (DEFAULT_LANGUAGE if profile_row is None else str(profile_row["course_language"])),
    }
    graded = await grade_answer(deps, actor, pending, text, profile)
    applied = await apply_learning_result(deps, actor, pending["attemptId"])
    states = applied.get("states") or []
    state = next((entry for entry in states if str(entry.get("notionId")) == pending["notionId"]), None)
    mastery_before = _js_round(float(0 if state is None else state.get("masteryBefore") or 0))
    mastery_after = _js_round(
        float(mastery_before if state is None else state.get("masteryAfter") or mastery_before)
    )
    correct = float(graded["score"]) >= PASSING_SCORE
    if not correct:
        end = user_day_bounds(
            user_local_day(to_epoch_ms(deps.clock.now()), str(meta["timezone"])),
            str(meta["timezone"]),
        )[1]
        async with deps.db.user_tx(actor) as tx:
            await queries.execute(
                tx,
                queries.FLAG_NOTION_IN_REVIEW,
                {
                    "user_id": actor.user_id,
                    "notion_id": pending["notionId"],
                    "end": to_iso(from_epoch_ms(end)),
                    "now": to_iso(deps.clock.now()),
                },
            )
    quiz = None if correct else await global_quiz_time(deps, actor, str(meta["formation_id"]))
    if correct:
        verdict = texts.SELF_TEST_OK.format(
            label=pending["notionLabel"], before=mastery_before, after=mastery_after
        )
    elif quiz is not None and quiz["label"] == texts.TOMORROW:
        verdict = texts.SELF_TEST_QUIZ_TOMORROW
    else:
        quiz_time = texts.QUIZ_DEFAULT_TIME if quiz is None else str(quiz["label"])
        verdict = texts.SELF_TEST_QUIZ_TONIGHT.format(time=quiz_time)
    content = f"{graded['feedback']}\n\n{verdict}"
    stored = {
        **row["self_test"],
        "status": "answered",
        "correct": correct,
        "masteryBefore": mastery_before,
        "masteryAfter": mastery_after,
    }
    async with deps.db.user_tx(actor) as tx:
        await queries.execute(
            tx,
            queries.INSERT_SELF_TEST_ANSWER,
            {
                "conversation_id": conversation_id,
                "user_id": actor.user_id,
                "content": text,
                "context": json_text({"include": {}, "selfTestAnswer": True}),
            },
        )
        await queries.execute(
            tx,
            queries.UPDATE_MESSAGE_SELF_TEST,
            {
                "id": row["id"],
                "user_id": actor.user_id,
                "self_test": json_text(stored),
            },
        )
        inserted = await queries.one(
            tx,
            queries.INSERT_CORRECTION_MESSAGE,
            {
                "conversation_id": conversation_id,
                "user_id": actor.user_id,
                "content": content,
                "context": json_text(
                    {
                        "followUpLabels": {
                            "test_me": texts.FOLLOW_UP_LABELS["test_me"],
                            "example": texts.FOLLOW_UP_LABELS["example"],
                        }
                    }
                ),
                "follow_ups": "{test_me,example}",
                "self_test": json_text(stored),
            },
        )
    if inserted is None:
        raise AppError("INTERNAL_ERROR", texts.CORRECTION_NOT_SAVED)
    return {"message": message_dto(inserted)}
