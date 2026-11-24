"""Diagnostic attempt of simple mode (SPEC-4001 EF-10, EF-11; CA-5).

The diagnostic is one activity of kind `diagnostic` holding a choice question per module (two beyond
four hours), generated from the section summaries. `check` is refused: the answers are graded at
submission, a module is acquired when all its questions are right, and the caller then validates the
acquired modules.
"""

import json
from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.application.quiz import is_checked
from learny.assessments.domain.bricks.grade import grade_brick
from learny.assessments.domain.bricks.grade_support import BrickGradeError
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import to_epoch_ms, to_iso

QUESTION_TYPE = "choice_question"


def items_of(value: Any) -> list[dict[str, Any]]:
    """`itemsOf`: the activity items, ignoring anything that is not an object."""
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, Mapping)]


DIAGNOSTIC_THRESHOLD = 80


def _payload(question: Mapping[str, Any]) -> dict[str, Any]:
    """The `choice_question` payload built from one generated question."""
    correct = str(question["correct"])[:200]
    options: list[dict[str, Any]] = [
        {"id": "a", "text": correct, "correct": True, "notionId": None}
    ]
    for index, wrong in enumerate(question.get("wrong") or [], start=1):
        options.append(
            {
                "id": chr(ord("a") + index),
                "text": str(wrong)[:200],
                "correct": False,
                "notionId": None,
            }
        )
    while len(options) < 2:
        options.append(
            {
                "id": chr(ord("a") + len(options)),
                "text": texts.DIAGNOSTIC_WRONG_DEFAULT,
                "correct": False,
                "notionId": None,
            }
        )
    return {
        "stem": str(question["stem"])[:600],
        "mode": "single",
        "options": options[:6],
        "explanation": str(question.get("explanation") or texts.DIAGNOSTIC_EXPLANATION)[:1200],
        "objective": str(question.get("objective") or texts.DIAGNOSTIC_OBJECTIVE)[:200],
        "sources": [],
    }


async def create_diagnostic_attempt(
    deps: AssessmentDeps,
    actor: Actor,
    *,
    formation_id: str,
    module_id: str,
    module_ids: Sequence[str],
    questions: Sequence[Mapping[str, Any]],
) -> str:
    """EF-10 - one activity, one attempt and one answer per generated question."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        items: list[dict[str, Any]] = []
        for question in questions:
            brick_id = await queries.insert_brick(
                tx,
                owner_id=actor.user_id,
                formation_id=formation_id,
                type_name=QUESTION_TYPE,
                notion_ids=(),
                purpose="bank",
            )
            if brick_id is None:
                raise AppError("INTERNAL_ERROR", texts.QUIZ_ACTIVITY_NOT_CREATED)
            payload = _payload(question)
            version_id = await queries.insert_brick_version(
                tx,
                brick_id=brick_id,
                version=1,
                payload=json.dumps(payload, ensure_ascii=False),
                fingerprint=None,
                origin="tutor",
                created_by="tutor",
            )
            if version_id is None:
                raise AppError("INTERNAL_ERROR", texts.QUIZ_ACTIVITY_NOT_CREATED)
            items.append(
                {
                    "brickId": brick_id,
                    "brickVersionId": version_id,
                    "points": 1.0,
                    "notionId": None,
                    "notionLabel": "",
                    "type": QUESTION_TYPE,
                    "payload": payload,
                    "moduleId": str(question.get("moduleId") or module_id),
                }
            )
        config = {
            "diagnostic": True,
            "moduleIds": list(module_ids),
            "questionCount": len(items),
            "scoring": "equal",
            "threshold": DIAGNOSTIC_THRESHOLD,
        }
        activity_id = await queries.insert_diagnostic_activity(
            tx,
            user_id=actor.user_id,
            formation_id=formation_id,
            module_id=module_id,
            config=json.dumps(config, ensure_ascii=False),
            items=json.dumps(items, ensure_ascii=False),
        )
        if activity_id is None:
            raise AppError("INTERNAL_ERROR", texts.QUIZ_ACTIVITY_NOT_CREATED)
        attempt_id = await queries.insert_quiz_attempt(
            tx,
            user_id=actor.user_id,
            activity_id=activity_id,
            attempt_no=1,
            started_at=to_iso(now),
        )
        if attempt_id is None:
            raise AppError("INTERNAL_ERROR", texts.QUIZ_ATTEMPT_NOT_CREATED)
        for index, item in enumerate(items):
            await queries.insert_quiz_answer(
                tx,
                attempt_id=attempt_id,
                version_id=str(item["brickVersionId"]),
                position=index + 1,
                max_score=float(item["points"]),
                answered_at=to_iso(now),
            )
        return attempt_id


def _responses(answer: Mapping[str, Any]) -> Any:
    response = answer["response"]
    if isinstance(response, str):
        try:
            return json.loads(response)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}
    return response if isinstance(response, Mapping) else {}


def module_results(
    items: Sequence[Mapping[str, Any]], answers: Sequence[Mapping[str, Any]]
) -> dict[str, list[bool]]:
    """EF-10 - per module, the verdict of every one of its questions."""
    results: dict[str, list[bool]] = {}
    for answer in answers:
        position = int(answer["position"])
        item = items[position - 1] if position - 1 < len(items) else {}
        module_id = str(item.get("moduleId") or "")
        if module_id == "":
            continue
        results.setdefault(module_id, []).append(answer["is_correct"] is True)
    return results


async def grade_diagnostic_attempt(deps: AssessmentDeps, actor: Actor, attempt_id: str) -> dict[str, Any]:
    """EF-10 - grades the drafts, closes the attempt and returns the acquired modules."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        attempt = await queries.read_diagnostic_attempt(tx, actor.user_id, attempt_id)
        if attempt is None:
            raise AppError("NOT_FOUND", texts.QUIZ_ATTEMPT_NOT_FOUND)
        if attempt["status"] != "in_progress":
            config = attempt.get("config")
            raw_acquired = config.get("acquiredModuleIds") if isinstance(config, Mapping) else None
            acquired = raw_acquired if isinstance(raw_acquired, list) else []
            return {
                "formationId": str(attempt["formation_id"]),
                "acquiredModuleIds": [str(value) for value in acquired],
                "alreadyGraded": True,
            }
        items = items_of(attempt["items"])
        answers = await queries.read_submit_answers(tx, attempt_id)
        correct = 0
        for answer in answers:
            position = int(answer["position"])
            item = items[position - 1] if position - 1 < len(items) else {}
            version_id = str(answer["brick_version_id"])
            max_score = 0.0 if answer["max_score"] is None else float(answer["max_score"])
            if is_checked(answer):
                correct += 1 if answer["is_correct"] is True else 0
                continue
            is_correct = False
            try:
                payload = item.get("payload")
                if not isinstance(payload, Mapping):
                    raise BrickGradeError("RESPONSE_INVALID", [])
                outcome = grade_brick(QUESTION_TYPE, payload, _responses(answer), version_id)
                is_correct = bool(outcome["isCorrect"])
            except BrickGradeError:
                is_correct = False
            await queries.update_quiz_answer_checked(
                tx,
                answer_id=str(answer["id"]),
                response=json.dumps(_responses(answer), ensure_ascii=False),
                is_correct=is_correct,
                score=max_score if is_correct else 0.0,
                max_score=max_score,
                time_ms=0,
                feedback=json.dumps(
                    {
                        "isCorrect": is_correct,
                        "title": texts.GRADE_FEEDBACK_EXACT
                        if is_correct
                        else texts.GRADE_FEEDBACK_APPROXIMATE,
                        "explanation": texts.DIAGNOSTIC_EXPLANATION,
                        "correction": None,
                        "scoreRatio": 1.0 if is_correct else 0.0,
                    },
                    ensure_ascii=False,
                ),
                chosen_distractor_notion_id=None,
                now=to_iso(now),
            )
            correct += 1 if is_correct else 0
        refreshed = await queries.read_submit_answers(tx, attempt_id)
        results = module_results(items, refreshed)
        acquired = [module_id for module_id, verdicts in results.items() if verdicts and all(verdicts)]
        total = max(1, len(answers))
        score = round(correct / total * 100, 2)
        duration_ms = max(0, to_epoch_ms(now) - to_epoch_ms(attempt["started_at"]))
        await queries.update_quiz_graded(
            tx,
            attempt_id=attempt_id,
            score=score,
            passed=score >= DIAGNOSTIC_THRESHOLD,
            per_notion=json.dumps({}, ensure_ascii=False),
            now=to_iso(now),
            duration_ms=duration_ms,
        )
        await queries.update_activity_config(
            tx,
            str(attempt["activity_id"]),
            json.dumps({"acquiredModuleIds": acquired}, ensure_ascii=False),
        )
        return {
            "formationId": str(attempt["formation_id"]),
            "acquiredModuleIds": acquired,
            "alreadyGraded": False,
        }


__all__ = [
    "create_diagnostic_attempt",
    "grade_diagnostic_attempt",
    "module_results",
]
