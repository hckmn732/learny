"""[SPEC-2202] Exam answers and marks (SPEC-614 EF-2, ET-4, BR-PRA-03).

An answer is written before the deadline plus the five-second tolerance and refused after it; a
marked question keeps its marker across reloads. The attempt is locked and belongs to the learner.
"""

import json
from collections.abc import Callable
from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    one,
)
from learny.assessments.application import exams as exam_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import ExamAnswersSaveOutput, ExamQuestionsMarkOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")

DEADLINE = "2026-11-11T13:00:00Z"
"""One hour after the fixed clock of the suite: the exam still accepts answers."""


def choice_payload(notion_id: str) -> dict[str, Any]:
    """A single-choice question whose first option is the correct one."""
    return {
        "stem": "Which account increases on debit?",
        "mode": "single",
        "options": [
            {"id": "a", "text": "The bank account", "correct": True, "notionId": notion_id},
            {"id": "b", "text": "The capital account", "correct": False, "notionId": notion_id},
        ],
        "explanation": "The receipt increases the bank account on the debit side.",
        "objective": "Tell an asset account from a liability account",
        "sources": [],
    }


async def seed_exam(
    conn: Any,
    *,
    builder: Callable[[str], dict[str, Any]] = choice_payload,
    status: str = "in_progress",
    deadline: str | None = DEADLINE,
    review_feedback: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """One learner, one formation, one brick version and one mock exam with a single item."""
    user_id = await create_user(conn, "Alice", timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    module_id = await create_module(conn, formation_id, 1, title="Double entry", status="validated")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id)
    document = builder(notion_id)
    brick_id = await one(
        conn,
        """
        insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
        values (
          cast(:user as uuid), cast(:formation as uuid), 'choice_question',
          array[cast(:notion as uuid)], 'exam', 'active'
        )
        returning id::text as id
        """,
        user=user_id,
        formation=formation_id,
        notion=notion_id,
    )
    version_id = await one(
        conn,
        """
        insert into public.brick_versions (brick_id, version, payload, origin, created_by)
        values (cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor')
        returning id::text as id
        """,
        brick=str(brick_id["id"]),
        payload=json.dumps(document),
    )
    items = [
        {
            "brickId": str(brick_id["id"]),
            "brickVersionId": str(version_id["id"]),
            "notionId": notion_id,
            "notionLabel": "Double entry",
            "type": "choice_question",
            "payload": document,
        }
    ]
    config = {"threshold": 70, "durationSec": 2400, "questionCount": 1}
    activity_id = await one(
        conn,
        """
        insert into public.activities (
          owner_id, formation_id, module_id, kind, config, items, status
        ) values (
          cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
          'mock_exam', cast(:config as jsonb), cast(:items as jsonb), 'ready'
        )
        returning id::text as id
        """,
        user=user_id,
        formation=formation_id,
        module=str(module_id),
        config=json.dumps(config),
        items=json.dumps(items),
    )
    attempt_id = await one(
        conn,
        """
        insert into public.attempts (
          user_id, activity_id, attempt_no, status, started_at, deadline_at, review_feedback
        ) values (
          cast(:user as uuid), cast(:activity as uuid), 1, cast(:status as public.attempt_status),
          cast('2026-11-11T12:20:00Z' as timestamptz), cast(:deadline as timestamptz),
          cast(:review as jsonb)
        )
        returning id::text as id
        """,
        user=user_id,
        activity=str(activity_id["id"]),
        status=status,
        deadline=deadline,
        review=json.dumps(review_feedback or {}),
    )
    await conn.execute(
        text(
            """
            insert into public.answers (attempt_id, brick_version_id, position, response, max_score)
            values (cast(:attempt as uuid), cast(:version as uuid), 1, '{}'::jsonb, 1)
            """
        ),
        {"attempt": str(attempt_id["id"]), "version": str(version_id["id"])},
    )
    return {"userId": user_id, "attemptId": str(attempt_id["id"]), "notionId": notion_id}


async def test_an_answer_is_written_before_the_deadline(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_exam(tx.conn)
        saved = await exam_service.save_exam_answer(
            assessment_deps(tx),
            actor_for(seed["userId"]),
            seed["attemptId"],
            1,
            {"response": {"optionIds": ["a"]}, "timeMs": 6400},
        )
        answer = await one(
            tx.conn,
            """
            select response, time_ms, is_correct, graded_by::text as graded_by
              from public.answers where attempt_id = cast(:attempt as uuid)
            """,
            attempt=seed["attemptId"],
        )
        return saved, dict(answer)

    saved, answer = await rolled_back(database, run)
    parsed = ExamAnswersSaveOutput.model_validate(saved)
    assert parsed.position == 1
    assert answer["response"] == {"optionIds": ["a"]}
    assert answer["time_ms"] == 6400
    assert answer["is_correct"] is None
    assert answer["graded_by"] is None


async def test_an_answer_after_the_tolerance_window_is_refused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_exam(tx.conn, deadline="2026-11-11T12:19:00Z")
        with pytest.raises(AppError) as error:
            await exam_service.save_exam_answer(
                assessment_deps(tx),
                actor_for(seed["userId"]),
                seed["attemptId"],
                1,
                {"response": {"optionIds": ["a"]}, "timeMs": 0},
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "EXAM_TIME_OVER"


async def test_the_tolerance_window_accepts_a_late_answer(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_exam(tx.conn, deadline="2026-11-11T12:19:58Z")
        return await exam_service.save_exam_answer(
            assessment_deps(tx),
            actor_for(seed["userId"]),
            seed["attemptId"],
            1,
            {"response": {"optionIds": ["a"]}, "timeMs": 0},
        )

    saved = await rolled_back(database, run)
    assert ExamAnswersSaveOutput.model_validate(saved).position == 1


async def test_a_response_that_does_not_match_the_question_is_refused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_exam(tx.conn)
        with pytest.raises(AppError) as error:
            await exam_service.save_exam_answer(
                assessment_deps(tx),
                actor_for(seed["userId"]),
                seed["attemptId"],
                1,
                {"response": {"optionIds": ["zzz"]}, "timeMs": 0},
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "VALIDATION_FAILED"
    assert error.extra["errors"][0]["path"].startswith("response.optionIds")


async def test_a_position_outside_the_exam_is_refused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_exam(tx.conn)
        with pytest.raises(AppError) as error:
            await exam_service.save_exam_answer(
                assessment_deps(tx),
                actor_for(seed["userId"]),
                seed["attemptId"],
                4,
                {"response": {"optionIds": ["a"]}, "timeMs": 0},
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "VALIDATION_FAILED"


async def test_a_finished_exam_refuses_an_answer(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_exam(tx.conn, status="submitted")
        with pytest.raises(AppError) as error:
            await exam_service.save_exam_answer(
                assessment_deps(tx),
                actor_for(seed["userId"]),
                seed["attemptId"],
                1,
                {"response": {"optionIds": ["a"]}, "timeMs": 0},
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "CONFLICT"
    assert error.status == 409


async def test_marking_a_question_keeps_the_marker_across_reloads(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_exam(tx.conn, review_feedback={"markedPositions": [2, 3]})
        marked = await exam_service.mark_exam_question(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"], 1, True
        )
        stored = await one(
            tx.conn,
            "select review_feedback from public.attempts where id = cast(:attempt as uuid)",
            attempt=seed["attemptId"],
        )
        unmarked = await exam_service.mark_exam_question(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"], 1, False
        )
        after = await one(
            tx.conn,
            "select review_feedback from public.attempts where id = cast(:attempt as uuid)",
            attempt=seed["attemptId"],
        )
        return marked, dict(stored), unmarked, dict(after)

    marked, stored, unmarked, after = await rolled_back(database, run)
    assert ExamQuestionsMarkOutput.model_validate(marked).marked is True
    assert stored["review_feedback"]["markedPositions"] == [1, 2, 3]
    assert ExamQuestionsMarkOutput.model_validate(unmarked).marked is False
    assert after["review_feedback"]["markedPositions"] == [2, 3]


async def test_another_learner_cannot_answer_or_mark_the_exam(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_exam(tx.conn)
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        with pytest.raises(AppError) as answer_error:
            await exam_service.save_exam_answer(
                assessment_deps(tx),
                actor_for(bob),
                seed["attemptId"],
                1,
                {"response": {"optionIds": ["a"]}, "timeMs": 0},
            )
        with pytest.raises(AppError) as mark_error:
            await exam_service.mark_exam_question(
                assessment_deps(tx), actor_for(bob), seed["attemptId"], 1, True
            )
        return answer_error.value, mark_error.value

    answer_error, mark_error = await rolled_back(database, run)
    assert answer_error.code == "NOT_FOUND"
    assert mark_error.code == "NOT_FOUND"
