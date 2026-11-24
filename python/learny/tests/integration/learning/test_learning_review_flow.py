"""[SPEC-2202] Daily global quiz session (SPEC-701 ET-1 to ET-5).

The session of the day is created on the first load under a consultative lock, replayed
idempotently afterwards, and its answers update the FSRS journal in their own transaction. Every
read goes through the learner's RLS transaction, so a foreign formation is a 404 (CA-7).
"""

import json
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    FIXED,
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_notion_state,
    create_user,
)
from factories.learning_deps import learning_deps
from learny.learning.application import review as review_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import ReviewGlobalQuizTodayOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")

YESTERDAY = "2026-11-10T18:00:00Z"


async def seed_due_notion(conn: Any, user_id: str, *, status: str = "active") -> dict[str, Any]:
    """One active formation with a due recall card and its active brick version."""
    formation_id = await create_formation(conn, user_id, title="SAP", status=status)
    module_id = await create_module(conn, formation_id, 1, title="Reseaux", status="validated")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id)
    await create_notion_state(conn, user_id, notion_id, due_at=FIXED, in_review=True)
    brick_id = (
        (
            await conn.execute(
                text(
                    """
                    insert into public.bricks (
                      owner_id, formation_id, type, notion_ids, purpose, status
                    ) values (
                      cast(:user as uuid), cast(:formation as uuid), 'recall_card',
                      array[cast(:notion as uuid)], 'review', 'active'
                    )
                    returning id::text as id
                    """
                ),
                {"user": user_id, "formation": formation_id, "notion": notion_id},
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    version_id = (
        (
            await conn.execute(
                text(
                    """
                    insert into public.brick_versions (brick_id, version, payload, origin, created_by)
                    values (
                      cast(:brick as uuid), 1,
                      cast(:payload as jsonb), 'tutor', 'tutor'
                    )
                    returning id::text as id
                    """
                ),
                {
                    "brick": brick_id,
                    "payload": json.dumps(
                        {
                            "front": "What is the double-entry principle?",
                            "back": (
                                "Each transaction is recorded on the debit side of one account "
                                "and the credit side of another, for the same amount."
                            ),
                            "sources": [],
                        }
                    ),
                },
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    return {
        "formationId": formation_id,
        "moduleId": module_id,
        "notionId": notion_id,
        "brickId": brick_id,
        "versionId": version_id,
    }


async def test_nothing_due_returns_the_empty_dto_without_writing(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        formation_id = await create_formation(tx.conn, alice, title="SAP")
        dto = await review_service.get_or_create_today_session(
            learning_deps(tx), actor_for(alice), formation_id, "full"
        )
        activities = (
            (
                await tx.conn.execute(
                    text(
                        "select count(*)::int as total from public.activities"
                        " where owner_id = cast(:u as uuid)"
                    ),
                    {"u": alice},
                )
            )
            .mappings()
            .one()["total"]
        )
        return dto, activities

    dto, activities = await rolled_back(database, run)
    parsed = ReviewGlobalQuizTodayOutput.model_validate(dto)
    assert parsed.status == "empty"
    assert parsed.sessionId is None
    assert parsed.attemptId is None
    assert parsed.items == []
    assert parsed.forDate == "2026-11-11"
    assert activities == 0


async def test_a_paused_formation_is_served_as_paused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_due_notion(tx.conn, alice, status="paused")
        return await review_service.get_or_create_today_session(
            learning_deps(tx), actor_for(alice), seed["formationId"], "full"
        )

    dto = await rolled_back(database, run)
    parsed = ReviewGlobalQuizTodayOutput.model_validate(dto)
    assert parsed.status == "paused"
    assert parsed.sessionId is None


async def test_an_unknown_or_completed_formation_is_not_found(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        completed = await create_formation(tx.conn, alice, title="Fini", status="completed")
        codes = []
        for formation_id in ("00000000-0000-4000-8000-000000000000", completed):
            try:
                await review_service.get_or_create_today_session(
                    learning_deps(tx), actor_for(alice), formation_id, "full"
                )
            except AppError as error:
                codes.append(error.code)
        return codes

    assert await rolled_back(database, run) == ["NOT_FOUND", "NOT_FOUND"]


async def test_the_session_of_the_day_is_created_then_replayed(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_due_notion(tx.conn, alice)
        first = await review_service.get_or_create_today_session(
            learning_deps(tx), actor_for(alice), seed["formationId"], "full"
        )
        second = await review_service.get_or_create_today_session(
            learning_deps(tx), actor_for(alice), seed["formationId"], "full"
        )
        attempts = (
            (
                await tx.conn.execute(
                    text(
                        "select count(*)::int as total from public.attempts where user_id = cast(:u as uuid)"
                    ),
                    {"u": alice},
                )
            )
            .mappings()
            .one()["total"]
        )
        return first, second, attempts

    first, second, attempts = await rolled_back(database, run)
    parsed = ReviewGlobalQuizTodayOutput.model_validate(first)
    assert parsed.status == "in_progress"
    assert parsed.sessionId is not None
    assert parsed.attemptId is not None
    assert parsed.mode == "full"
    assert len(parsed.items) == 1
    item = parsed.items[0]
    assert item.type == "recall_card"
    assert item.name == "Carte de rappel"
    assert item.state == "todo"
    assert parsed.header.notionCount == 1
    assert parsed.header.modulesLabel == "Module 1"
    assert parsed.header.estimatedMinutes >= 1
    assert parsed.note != ""
    # ADR-0319: no gap, no deferral and a single module mean no tutor bullet.
    assert parsed.rationale == []
    assert parsed.modeOptions.fullMinutes >= 1
    assert item.intervals is not None
    assert item.intervals.good is not None
    assert second["sessionId"] == parsed.sessionId
    assert attempts == 1


async def test_a_foreign_formation_is_invisible(database: Database) -> None:
    async def run(tx: Any) -> str:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        seed = await seed_due_notion(tx.conn, alice)
        try:
            await review_service.get_or_create_today_session(
                learning_deps(tx), actor_for(bob), seed["formationId"], "full"
            )
        except AppError as error:
            return error.code
        return "OK"

    assert await rolled_back(database, run) == "NOT_FOUND"
