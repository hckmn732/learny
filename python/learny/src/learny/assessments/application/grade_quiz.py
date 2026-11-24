"""Durable correction of one submitted validation attempt (SPEC-611 ET-8, BR-QUI-04, CL-6).

The open answers are corrected first, then the score and the verdict are computed, then the learning
result is applied and `quiz/graded` is queued. Every step is idempotent, so a replayed delivery of
`quiz/submitted` never produces a second event: the attempt status is the state guard and the event
identifier is `quiz-graded:<attemptId>`.

The handler is a thin orchestrator: every rule stays in the step it delegates to
(`grade_open_answers`, `finalize_attempt`, `apply_learning_result`).
"""

from collections.abc import Mapping
from typing import Any

from learny.assessments.application.grade_open import OpenAnswerGrader, grade_open_answers
from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.application.quiz_submit import finalize_attempt
from learny.identity.domain.actor import Actor
from learny.learning.public import apply_learning_result

QUIZ_GRADE_JOB = "quiz-grade"


async def emit_graded(
    deps: AssessmentDeps,
    actor: Actor,
    outcome: Mapping[str, Any],
    attempt_id: str,
) -> str:
    """ET-8 step 4 - queues `quiz/graded` once per attempt (dedupe identifier)."""
    async with deps.db.user_tx(actor) as tx:
        identifier = await tx.emit(
            "quiz/graded",
            {
                "userId": actor.user_id,
                "formationId": outcome["formationId"],
                "moduleId": outcome["moduleId"],
                "attemptId": attempt_id,
                "score": outcome["score"] if outcome["score"] is not None else 0,
                "passed": outcome["passed"] if outcome["passed"] is not None else False,
                "threshold": outcome["threshold"],
                "attemptNo": outcome["attemptNo"],
            },
            event_id=f"quiz-graded:{attempt_id}",
        )
    return str(identifier)


async def grade_quiz(
    deps: AssessmentDeps,
    user_id: str,
    attempt_id: str,
    *,
    grader: OpenAnswerGrader | None = None,
    scenario: str | None = None,
) -> dict[str, Any]:
    """Runs the whole grade job in order: open answers, score, learning, event (ET-8)."""
    await grade_open_answers(deps, user_id, attempt_id, grader=grader, scenario=scenario)
    actor = Actor(user_id=user_id, email="", email_confirmed=True, transport="bearer")
    finalized = await finalize_attempt(deps, actor, attempt_id)
    if finalized["status"] == "graded":
        await apply_learning_result(deps, actor, attempt_id)
        await emit_graded(deps, actor, finalized, attempt_id)
    return finalized


__all__ = ["QUIZ_GRADE_JOB", "emit_graded", "grade_quiz"]
