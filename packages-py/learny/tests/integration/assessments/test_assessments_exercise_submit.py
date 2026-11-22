"""[SPEC-2202] Submission of a practice exercise (SPEC-613 EF-2, ET-4, ET-5, CL-5).

The submit transaction writes the answer, the graded attempt and the `exercise/submitted` outbox row
together; the mastery application of SPEC-411 runs after the commit and stays idempotent through the
unique review-log key. A replay returns the stored correction and changes nothing.
"""

from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.exercise_support import WEAK_EXPLANATION, seed_exercise, valid_submission
from factories.identity_support import actor_for, count, create_user, event_by_id, one
from learny.assessments.application import exercises as service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from learny_api.generated.models import ExercisesSubmitOutput

pytestmark = pytest.mark.spec("SPEC-2202")


async def read_attempt(conn: Any, attempt_id: str) -> Any:
    """The graded attempt, its answer and the feedback stored with them."""
    return await one(
        conn,
        """
        select at.status::text as status, at.score::text as score, at.passed,
               at.duration_ms, at.review_feedback,
               a.is_correct, a.score::text as answer_score, a.max_score::text as answer_max_score,
               a.graded_by::text as graded_by, a.feedback
          from public.attempts at
          join public.answers a on a.attempt_id = at.id and a.position = 1
         where at.id = cast(:attempt as uuid)
        """,
        attempt=attempt_id,
    )


async def test_submit_grades_applies_mastery_and_emits_the_event(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        result = await service.submit_exercise(
            assessment_deps(tx), actor_for(alice), seed["activityId"], valid_submission()
        )
        attempt = await read_attempt(tx.conn, result["attemptId"])
        stored = await one(
            tx.conn,
            """
            select mastery::text as mastery, success_count
              from public.notion_states
             where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid)
            """,
            user=alice,
            notion=seed["notionId"],
        )
        logs = await count(
            tx.conn,
            "select count(*)::int as count from public.review_logs where user_id = cast(:u as uuid)",
            u=alice,
        )
        activity = await one(
            tx.conn,
            """
            select qualifying, sources
              from public.daily_activity
             where user_id = cast(:u as uuid) and day = cast('2026-11-11' as date)
            """,
            u=alice,
        )
        event = await event_by_id(tx.conn, f"exercise-submitted:{result['attemptId']}")
        return result, attempt, stored, logs, activity, event, seed

    result, attempt, stored, logs, activity, event, seed = await rolled_back(database, run)
    parsed = ExercisesSubmitOutput.model_validate(result)
    assert parsed.status == "graded"
    assert parsed.correction.score == 10
    assert parsed.correction.maxScore == 10
    assert parsed.correction.verdict == "passed"
    assert parsed.masteryBefore == 0
    assert parsed.masteryAfter == float(stored["mastery"])
    assert parsed.masteryAfter > 0
    assert attempt["status"] == "graded"
    assert attempt["passed"] is True
    assert float(attempt["score"]) == 100
    assert attempt["graded_by"] == "tutor"
    assert attempt["review_feedback"]["masteryBefore"] == 0
    assert attempt["review_feedback"]["masteryAfter"] == float(stored["mastery"])
    assert logs == 1
    assert activity["qualifying"] is True
    assert event is not None
    assert event["name"] == "exercise/submitted"
    assert event["data"]["attemptId"] == result["attemptId"]
    assert event["data"]["moduleId"] == seed["moduleId"]


async def test_submit_replay_returns_the_stored_correction_without_a_second_effect(
    database: Database,
) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        first = await service.submit_exercise(
            assessment_deps(tx), actor_for(alice), seed["activityId"], valid_submission()
        )
        replay = await service.submit_exercise(
            assessment_deps(tx),
            actor_for(alice),
            seed["activityId"],
            {**valid_submission(), "text": "A different production, refused by the replay."},
        )
        logs = await count(
            tx.conn,
            "select count(*)::int as count from public.review_logs where user_id = cast(:u as uuid)",
            u=alice,
        )
        answers = await count(
            tx.conn,
            "select count(*)::int as count from public.answers where attempt_id = cast(:a as uuid)",
            a=first["attemptId"],
        )
        events = await count(
            tx.conn,
            "select count(*)::int as count from public.event_outbox where event_id = :e",
            e=f"exercise-submitted:{first['attemptId']}",
        )
        return first, replay, logs, answers, events

    first, replay, logs, answers, events = await rolled_back(database, run)
    assert replay["attemptId"] == first["attemptId"]
    assert replay["correction"] == first["correction"]
    assert logs == 1
    assert answers == 1
    assert events == 1


async def test_submit_applies_the_hint_penalty(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        for _ in range(2):
            await service.request_exercise_hint(
                assessment_deps(tx), actor_for(alice), seed["activityId"], seed["moduleId"]
            )
        return await service.submit_exercise(
            assessment_deps(tx), actor_for(alice), seed["activityId"], valid_submission()
        )

    result = await rolled_back(database, run)
    parsed = ExercisesSubmitOutput.model_validate(result)
    assert parsed.correction.maxScore == 8
    assert parsed.correction.score == 8
    assert parsed.correction.verdict == "retry"
    assert parsed.correction.nextStep.href.endswith("/lacunes")


async def test_submit_refuses_an_invalid_production_before_any_grade(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        submission = valid_submission()
        del submission["explanation"]
        with pytest.raises(AppError) as refused:
            await service.submit_exercise(
                assessment_deps(tx), actor_for(alice), seed["activityId"], submission
            )
        logs = await count(
            tx.conn,
            "select count(*)::int as count from public.review_logs where user_id = cast(:u as uuid)",
            u=alice,
        )
        attempt = await one(
            tx.conn,
            """
            select count(*)::int as count
              from public.attempts
             where activity_id = cast(:a as uuid)
            """,
            a=seed["activityId"],
        )
        return refused.value, logs, attempt

    error, logs, attempt = await rolled_back(database, run)
    assert error.code == "RESPONSE_INVALID"
    assert error.status == 422
    assert error.extra["errors"][0] == {
        "path": "explanation",
        "message": texts.EXERCISE_EXPLANATION_REQUIRED,
    }
    assert logs == 0
    assert attempt["count"] == 0


async def test_submit_returns_a_retry_verdict_and_the_gap_link(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, alice)
        result = await service.submit_exercise(
            assessment_deps(tx),
            actor_for(alice),
            seed["activityId"],
            valid_submission(WEAK_EXPLANATION),
        )
        return result, seed

    result, seed = await rolled_back(database, run)
    parsed = ExercisesSubmitOutput.model_validate(result)
    assert parsed.correction.verdict == "retry"
    assert parsed.correction.score == 8
    assert parsed.correction.nextStep.href == f"/formations/{seed['formationId']}/lacunes"


async def test_submit_hides_another_learner_exercise(database: Database) -> None:
    async def run(tx: Any) -> str:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        seed = await seed_exercise(tx.conn, bob)
        with pytest.raises(AppError) as refused:
            await service.submit_exercise(
                assessment_deps(tx), actor_for(alice), seed["activityId"], valid_submission()
            )
        return refused.value.code

    assert await rolled_back(database, run) == "NOT_FOUND"
