"""[SPEC-2202] Submission and final score of a validation attempt (SPEC-611, EF-7, ET-7, ET-8).

Port of the useful cases of `packages/services/src/quiz/submit.ts`: the submission commits the
answers and `quiz/submitted` together, a second submission relaunches the correction with a distinct
event identifier, an unchecked question blocks the submission, and `finalize_attempt` computes the
score, the per-notion detail and the verdict without any client-supplied value.
"""

import json
from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.identity_support import (
    FIXED,
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    identifier,
    one,
)
from learny.assessments.application import quiz_submit as service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import QuizAttemptsSubmitOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


def choice_document(notion_id: str, index: int) -> dict[str, Any]:
    """One valid single-choice question, distinct per index."""
    return {
        "stem": f"Which account increases on debit ({index})?",
        "mode": "single",
        "options": [
            {"id": "a", "text": "The bank account", "correct": True, "notionId": notion_id},
            {"id": "b", "text": "The capital account", "correct": False, "notionId": notion_id},
        ],
        "explanation": "The receipt increases the bank account on the debit side.",
        "objective": "Tell an asset account from a liability account",
        "sources": [],
    }


async def seed_attempt(
    conn: Any,
    *,
    positions: int = 2,
    checked: tuple[bool, ...] = (True, True),
    graded: tuple[bool | None, ...] = (True, False),
    status: str = "in_progress",
) -> dict[str, Any]:
    """One learner, one module and one attempt holding checked answers."""
    user_id = await create_user(conn, "Alice", timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    module_id = await create_module(conn, formation_id, 1, title="Double entry", status="validated")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id)
    items: list[dict[str, Any]] = []
    version_ids: list[str] = []
    for index in range(positions):
        document = choice_document(notion_id, index)
        brick_id = await identifier(
            conn,
            """
            insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
            values (
              cast(:owner as uuid), cast(:formation as uuid), 'choice_question',
              array[cast(:notion as uuid)], 'validation', 'active'
            )
            returning id::text as id
            """,
            owner=user_id,
            formation=formation_id,
            notion=notion_id,
        )
        version_id = await identifier(
            conn,
            """
            insert into public.brick_versions (brick_id, version, payload, origin, created_by)
            values (cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor')
            returning id::text as id
            """,
            brick=brick_id,
            payload=json.dumps(document),
        )
        version_ids.append(version_id)
        items.append(
            {
                "brickId": brick_id,
                "brickVersionId": version_id,
                "points": 50,
                "notionId": notion_id,
                "notionLabel": "Double entry",
                "type": "choice_question",
                "payload": document,
            }
        )
    activity_id = await identifier(
        conn,
        """
        insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
        values (
          cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
          'validation_quiz', cast(:config as jsonb), cast(:items as jsonb), 'ready'
        )
        returning id::text as id
        """,
        user=user_id,
        formation=formation_id,
        module=module_id,
        config=json.dumps({"threshold": 80}),
        items=json.dumps(items),
    )
    attempt_id = await identifier(
        conn,
        """
        insert into public.attempts (user_id, activity_id, attempt_no, status, started_at)
        values (
          cast(:user as uuid), cast(:activity as uuid), 1,
          cast(:status as public.attempt_status), cast('2026-11-11T12:00:00Z' as timestamptz)
        )
        returning id::text as id
        """,
        user=user_id,
        activity=activity_id,
        status=status,
    )
    for index, version_id in enumerate(version_ids):
        is_checked = checked[index]
        is_correct = graded[index] if is_checked else None
        await conn.execute(
            text(
                """
                insert into public.answers (
                  attempt_id, brick_version_id, position, response, is_correct, score,
                  max_score, graded_by, feedback
                ) values (
                  cast(:attempt as uuid), cast(:version as uuid), :position,
                  cast(:response as jsonb), :correct, :score, 50, :graded_by,
                  cast(:feedback as jsonb)
                )
                """
            ),
            {
                "attempt": attempt_id,
                "version": version_id,
                "position": index + 1,
                "response": json.dumps({"optionIds": ["a"]}),
                "correct": is_correct,
                "score": 50 if is_correct else 0,
                "graded_by": "code" if is_checked else None,
                "feedback": json.dumps({"checked": True} if is_checked else {}),
            },
        )
    return {
        "userId": user_id,
        "formationId": formation_id,
        "moduleId": module_id,
        "attemptId": attempt_id,
    }


async def event_ids(tx: Any, name: str) -> list[str]:
    """Every outbox event of one name, in insertion order."""
    rows = await tx.conn.execute(
        text("select event_id from public.event_outbox where name = :name order by created_at, event_id"),
        {"name": name},
    )
    return [str(row["event_id"]) for row in rows.mappings().all()]


async def test_submitting_closes_the_attempt_and_emits_the_event(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], Any, list[str], str]:
        seed = await seed_attempt(tx.conn)
        result = await service.submit_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )
        attempt = await one(
            tx.conn,
            """
            select status::text as status, submitted_at, duration_ms
              from public.attempts where id = cast(:attempt as uuid)
            """,
            attempt=seed["attemptId"],
        )
        return result, attempt, await event_ids(tx, "quiz/submitted"), seed["attemptId"]

    result, attempt, events, attempt_id = await rolled_back(database, run)
    parsed = QuizAttemptsSubmitOutput.model_validate(result)
    assert parsed.status == "submitted"
    assert parsed.pendingOpenCount == 0
    assert attempt["status"] == "submitted"
    assert attempt["submitted_at"] == FIXED
    assert attempt["duration_ms"] == 1_200_000
    assert events == [f"quiz-submitted:{attempt_id}"]


async def test_a_second_submission_relaunches_the_correction(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], list[str]]:
        seed = await seed_attempt(tx.conn)
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        await service.submit_attempt(deps, actor, seed["attemptId"])
        second = await service.submit_attempt(deps, actor, seed["attemptId"])
        return second, await event_ids(tx, "quiz/submitted")

    second, events = await rolled_back(database, run)
    assert second["status"] == "submitted"
    assert len(events) == 2
    assert events[1] != events[0]
    assert events[1].startswith("quiz-submitted:")


async def test_submitting_a_graded_attempt_changes_nothing(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], list[str]]:
        seed = await seed_attempt(tx.conn, status="graded")
        result = await service.submit_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )
        return result, await event_ids(tx, "quiz/submitted")

    result, events = await rolled_back(database, run)
    assert result == {"status": "graded", "pendingOpenCount": 0}
    assert events == []


async def test_an_unchecked_question_blocks_the_submission(database: Database) -> None:
    async def run(tx: Any) -> AppError:
        seed = await seed_attempt(tx.conn, checked=(True, False))
        with pytest.raises(AppError) as error:
            await service.submit_attempt(assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"])
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "CONFLICT"
    assert error.status == 409
    assert error.extra["errors"][0]["path"] == "questions.2"


async def test_the_final_score_needs_every_open_answer(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_attempt(tx.conn, checked=(True, True), graded=(True, None), status="submitted")
        return await service.finalize_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )

    outcome = await rolled_back(database, run)
    assert outcome["status"] == "submitted"
    assert outcome["score"] is None
    assert outcome["pendingOpenCount"] == 1


async def test_the_final_score_is_computed_from_the_corrected_answers(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], Any]:
        seed = await seed_attempt(tx.conn, status="submitted")
        outcome = await service.finalize_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )
        attempt = await one(
            tx.conn,
            """
            select status::text as status, score::text as score, passed, per_notion, duration_ms
              from public.attempts where id = cast(:attempt as uuid)
            """,
            attempt=seed["attemptId"],
        )
        return outcome, attempt

    outcome, attempt = await rolled_back(database, run)
    assert outcome["status"] == "graded"
    assert float(outcome["score"] or 0) == 50
    assert outcome["passed"] is False
    assert outcome["threshold"] == 80
    assert attempt["status"] == "graded"
    assert float(attempt["score"]) == 50
    assert attempt["passed"] is False
    assert len(attempt["per_notion"]) == 1
    only = next(iter(attempt["per_notion"].keys()))
    assert attempt["per_notion"][only]["correct"] == 1


async def test_another_learner_cannot_submit(database: Database) -> None:
    async def run(tx: Any) -> str:
        seed = await seed_attempt(tx.conn)
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        with pytest.raises(AppError) as error:
            await service.submit_attempt(assessment_deps(tx), actor_for(bob), seed["attemptId"])
        return error.value.code

    assert await rolled_back(database, run) == "NOT_FOUND"
