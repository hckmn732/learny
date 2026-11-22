"""[SPEC-2202] Creation of a validation quiz attempt (SPEC-611, EF-1, EF-8, ET-2, ET-6).

Port of the useful cases of `packages/services/src/quiz/start.ts`: the single running attempt of the
module is resumed, a locked module never opens, an empty or exhausted bank returns `preparing`
without creating anything, and the retry gate refuses a new attempt inside its delay.
"""

import json
from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    count,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    identifier,
    one,
)
from learny.assessments.application import quiz_start as service
from learny.assessments.domain.bricks.fingerprint import brick_fingerprint
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import QuizAttemptsCreateOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


def choice_document(index: int) -> dict[str, Any]:
    """One valid single-choice question, distinct per index so the fingerprints differ."""
    return {
        "stem": f"Which account increases on debit ({index})?",
        "mode": "single",
        "options": [
            {"id": "a", "text": "The bank account", "correct": True, "notionId": None},
            {"id": "b", "text": "The capital account", "correct": False, "notionId": None},
        ],
        "explanation": "The receipt increases the bank account on the debit side.",
        "objective": "Tell an asset account from a liability account",
        "sources": [],
    }


async def seed_module(
    conn: Any, *, notions: int = 3, bricks: int = 12, module_status: str = "open"
) -> dict[str, Any]:
    """One learner, one module with notions and a bank of choice questions."""
    user_id = await create_user(conn, "Alice", timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    module_id = await create_module(conn, formation_id, 1, title="Double entry", status=module_status)
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_ids: list[str] = []
    for position in range(1, notions + 1):
        notion_ids.append(await create_notion(conn, formation_id, module_id, chapter_id, position=position))
    for index in range(bricks):
        notion_id = notion_ids[index % len(notion_ids)] if notion_ids else None
        payload = choice_document(index)
        document = {
            **payload,
            "options": [{**option, "notionId": notion_id} for option in payload["options"]],
        }
        brick_id = await identifier(
            conn,
            """
            insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
            values (
              cast(:owner as uuid), cast(:formation as uuid), 'choice_question',
              array[cast(:notion as uuid)], 'bank', 'active'
            )
            returning id::text as id
            """,
            owner=user_id,
            formation=formation_id,
            notion=notion_id,
        )
        await identifier(
            conn,
            """
            insert into public.brick_versions (brick_id, version, payload, fingerprint, origin, created_by)
            values (
              cast(:brick as uuid), 1, cast(:payload as jsonb), :fingerprint, 'tutor', 'tutor'
            )
            returning id::text as id
            """,
            brick=brick_id,
            payload=json.dumps(document),
            fingerprint=brick_fingerprint("choice_question", document),
        )
    return {
        "userId": user_id,
        "formationId": formation_id,
        "moduleId": module_id,
        "notionIds": notion_ids,
    }


async def test_starting_a_quiz_materialises_the_questions(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], Any]:
        seed = await seed_module(tx.conn)
        result = await service.start_validation_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        attempt = await one(
            tx.conn,
            """
            select at.status::text as status, act.config, act.items,
                   count(a.id)::int as answers
              from public.attempts at
              join public.activities act on act.id = at.activity_id
              join public.answers a on a.attempt_id = at.id
             where at.id = cast(:attempt as uuid)
             group by at.id, act.id
            """,
            attempt=result["attemptId"],
        )
        return result, attempt

    result, attempt = await rolled_back(database, run)
    parsed = QuizAttemptsCreateOutput.model_validate(result)
    assert getattr(parsed.root, "attemptId", None) == result["attemptId"]
    assert attempt["status"] == "in_progress"
    assert attempt["answers"] == 12
    assert attempt["config"]["threshold"] == 80
    assert attempt["config"]["questionCount"] == 12
    assert len(attempt["items"]) == 12
    assert attempt["items"][0]["payload"]["stem"].startswith("Which account increases on debit")
    assert attempt["items"][0]["notionLabel"]


async def test_a_second_start_resumes_the_running_attempt(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], dict[str, Any], int]:
        seed = await seed_module(tx.conn)
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        first = await service.start_validation_attempt(deps, actor, seed["moduleId"])
        second = await service.start_validation_attempt(deps, actor, seed["moduleId"])
        attempts = await count(
            tx.conn,
            "select count(*)::int as count from public.attempts where user_id = cast(:user as uuid)",
            user=seed["userId"],
        )
        return first, second, attempts

    first, second, attempts = await rolled_back(database, run)
    assert second["attemptId"] == first["attemptId"]
    assert second["resumed"] is True
    assert attempts == 1


async def test_a_locked_module_never_opens(database: Database) -> None:
    async def run(tx: Any) -> AppError:
        seed = await seed_module(tx.conn, module_status="locked")
        with pytest.raises(AppError) as error:
            await service.start_validation_attempt(
                assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "MODULE_LOCKED"
    assert error.status == 422


async def test_a_module_without_notions_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> str:
        seed = await seed_module(tx.conn, notions=0, bricks=0)
        with pytest.raises(AppError) as error:
            await service.start_validation_attempt(
                assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
            )
        return error.value.code

    assert await rolled_back(database, run) == "CONFLICT"


async def test_an_empty_bank_returns_preparing_without_creating_anything(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], int]:
        seed = await seed_module(tx.conn, bricks=0)
        result = await service.start_validation_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        attempts = await count(
            tx.conn,
            "select count(*)::int as count from public.attempts where user_id = cast(:user as uuid)",
            user=seed["userId"],
        )
        return result, attempts

    result, attempts = await rolled_back(database, run)
    assert result == {"preparing": True, "retryAfterSec": 3}
    assert attempts == 0


async def test_a_bank_smaller_than_the_quiz_returns_preparing(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], int]:
        # Three bricks cannot fill the twelve questions of the draw: the bank is exhausted.
        seed = await seed_module(tx.conn, bricks=3)
        result = await service.start_validation_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
        )
        attempts = await count(
            tx.conn,
            "select count(*)::int as count from public.attempts where user_id = cast(:user as uuid)",
            user=seed["userId"],
        )
        return result, attempts

    result, attempts = await rolled_back(database, run)
    assert result == {"preparing": True, "retryAfterSec": 3}
    assert attempts == 0


async def test_the_retry_gate_refuses_a_new_attempt_inside_the_delay(database: Database) -> None:
    async def run(tx: Any) -> AppError:
        seed = await seed_module(tx.conn)
        versions = await one(
            tx.conn,
            "select bv.id::text as version_id, bv.brick_id::text as brick_id "
            "from public.brick_versions bv order by bv.id limit 1",
        )
        activity_id = await identifier(
            tx.conn,
            """
            insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
            values (
              cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
              'validation_quiz', '{"threshold": 80}'::jsonb, cast(:items as jsonb), 'ready'
            )
            returning id::text as id
            """,
            user=seed["userId"],
            formation=seed["formationId"],
            module=seed["moduleId"],
            items=json.dumps(
                [
                    {
                        "brickId": versions["brick_id"],
                        "brickVersionId": versions["version_id"],
                        "points": 50,
                    }
                ]
            ),
        )
        await tx.conn.execute(
            text(
                """
                insert into public.attempts (
                  user_id, activity_id, attempt_no, status, started_at, submitted_at, score, passed
                ) values (
                  cast(:user as uuid), cast(:activity as uuid), 1, 'graded',
                  cast('2026-11-11T10:00:00Z' as timestamptz),
                  cast('2026-11-11T11:00:00Z' as timestamptz), 60, false
                )
                """
            ),
            {"user": seed["userId"], "activity": activity_id},
        )
        with pytest.raises(AppError) as error:
            await service.start_validation_attempt(
                assessment_deps(tx), actor_for(seed["userId"]), seed["moduleId"]
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "RETRY_NOT_YET_ALLOWED"
    assert error.status == 422
    assert error.extra["reason"] == "delay"


async def test_a_foreign_module_is_not_found(database: Database) -> None:
    async def run(tx: Any) -> str:
        seed = await seed_module(tx.conn)
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        with pytest.raises(AppError) as error:
            await service.start_validation_attempt(assessment_deps(tx), actor_for(bob), seed["moduleId"])
        return error.value.code

    assert await rolled_back(database, run) == "NOT_FOUND"
