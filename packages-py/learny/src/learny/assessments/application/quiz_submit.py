"""Submission and final score of a validation attempt (SPEC-611 EF-7, ET-7, ET-8, CL-3, CL-6).

The submission commits the answers and the `quiz/submitted` event together, and a second submission
relaunches the correction with a distinct event identifier. `finalize_attempt` is the second step of
the grade job: it computes the score, the `per_notion` detail and the verdict without any
client-supplied value. The tutor correction of the open answers (`gradeOpenAnswers`) belongs to the
AI context and is not ported here.
"""

import json
from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.application.quiz import is_checked
from learny.assessments.domain import quiz_score as score_domain
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import to_epoch_ms, to_iso


def items_of(value: Any) -> list[dict[str, Any]]:
    """`itemsOf`: the activity items, ignoring anything that is not an object."""
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, Mapping)]


def points_of(answer: Mapping[str, Any]) -> float:
    """`pointsOf`: the question scale stored on the answer, zero when it is missing."""
    return 0.0 if answer["max_score"] is None else float(answer["max_score"])


def scored_of(
    answers: Sequence[Mapping[str, Any]], items: Sequence[Mapping[str, Any]]
) -> list[dict[str, Any]]:
    """`scoredOf`: only a corrected answer enters the pure score."""
    scored: list[dict[str, Any]] = []
    for answer in answers:
        if answer["is_correct"] is None:
            continue
        position = int(answer["position"])
        item = items[position - 1] if position - 1 < len(items) else None
        notion_id = item.get("notionId") if item is not None else None
        scored.append(
            {
                "position": position,
                "notionId": notion_id if isinstance(notion_id, str) else str(answer["brick_version_id"]),
                "score": 0.0 if answer["score"] is None else float(answer["score"]),
                "maxScore": points_of(answer),
                "isCorrect": answer["is_correct"],
            }
        )
    return scored


async def submit_attempt(deps: AssessmentDeps, actor: Actor, attempt_id: str) -> dict[str, Any]:
    """EF-7, CL-6 - closes the attempt and emits `quiz/submitted` in the same transaction."""
    now = deps.clock.now()
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        attempt = await queries.read_submit_attempt(tx, user_id, attempt_id)
        if attempt is None:
            raise AppError("NOT_FOUND", texts.QUIZ_ATTEMPT_NOT_FOUND)
        answers = await queries.read_submit_answers(tx, attempt_id)
        items = items_of(attempt["items"])
        open_count = 0
        for answer in answers:
            index = int(answer["position"]) - 1
            if index >= len(items):
                continue
            if items[index].get("type") == "open_question":
                open_count += 1
        formation_id = str(attempt["formation_id"])
        module_id = str(attempt["module_id"])
        if attempt["status"] == "graded":
            return {"status": "graded", "pendingOpenCount": 0}
        pending = sum(1 for answer in answers if answer["is_correct"] is None)
        if attempt["status"] == "submitted":
            await tx.emit(
                "quiz/submitted",
                {
                    "userId": user_id,
                    "formationId": formation_id,
                    "moduleId": module_id,
                    "attemptId": attempt_id,
                    "activityId": str(attempt["activity_id"]),
                    "openCount": open_count,
                },
                event_id=f"quiz-submitted:{attempt_id}:retry:{to_iso(now)}",
            )
            return {"status": "submitted", "pendingOpenCount": pending}
        if attempt["status"] != "in_progress":
            raise AppError("CONFLICT", texts.QUIZ_NOT_MODIFIABLE, status=409)
        unchecked = [int(answer["position"]) for answer in answers if not is_checked(answer)]
        if unchecked:
            raise AppError(
                "CONFLICT",
                texts.QUIZ_UNCHECKED,
                status=409,
                errors=[
                    {
                        "code": "QUESTION_UNCHECKED",
                        "path": f"questions.{position}",
                        "message": texts.QUIZ_UNCHECKED_HINT,
                    }
                    for position in unchecked
                ],
            )
        duration_ms = max(0, to_epoch_ms(now) - to_epoch_ms(attempt["started_at"]))
        await queries.update_quiz_submitted(
            tx, attempt_id=attempt_id, now=to_iso(now), duration_ms=duration_ms
        )
        await tx.emit(
            "quiz/submitted",
            {
                "userId": user_id,
                "formationId": formation_id,
                "moduleId": module_id,
                "attemptId": attempt_id,
                "activityId": str(attempt["activity_id"]),
                "openCount": open_count,
            },
            event_id=f"quiz-submitted:{attempt_id}",
        )
        return {"status": "submitted", "pendingOpenCount": pending}


async def finalize_attempt(deps: AssessmentDeps, actor: Actor, attempt_id: str) -> dict[str, Any]:
    """ET-8 step 2 - score, `per_notion` and `passed`, without any client-supplied value."""
    now = deps.clock.now()
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        attempt = await queries.read_submit_attempt(tx, user_id, attempt_id)
        if attempt is None:
            raise AppError("NOT_FOUND", texts.QUIZ_ATTEMPT_NOT_FOUND)
        answers = await queries.read_submit_answers(tx, attempt_id)
        items = items_of(attempt["items"])
        pending_open = sum(1 for answer in answers if answer["is_correct"] is None and is_checked(answer))
        base = {
            "threshold": int(attempt["threshold"]),
            "attemptNo": int(attempt["attempt_no"]),
            "formationId": str(attempt["formation_id"]),
            "moduleId": str(attempt["module_id"]),
        }
        if pending_open > 0:
            return {
                **base,
                "status": "submitted",
                "score": None,
                "passed": None,
                "pendingOpenCount": pending_open,
            }
        computed = score_domain.compute_score(scored_of(answers, items))
        score = float(computed["score"])
        passed = score_domain.is_passed(score, float(attempt["threshold"]))
        submitted_at = now if attempt["submitted_at"] is None else attempt["submitted_at"]
        duration_ms = max(0, to_epoch_ms(submitted_at) - to_epoch_ms(attempt["started_at"]))
        await queries.update_quiz_graded(
            tx,
            attempt_id=attempt_id,
            score=score,
            passed=passed,
            per_notion=json.dumps(computed["perNotion"], ensure_ascii=False),
            now=to_iso(now),
            duration_ms=duration_ms,
        )
        return {
            **base,
            "status": "graded",
            "score": score,
            "passed": passed,
            "pendingOpenCount": 0,
        }


__all__ = ["finalize_attempt", "items_of", "points_of", "scored_of", "submit_attempt"]
