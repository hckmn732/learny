"""[SPEC-2202] Daily offline pack (SPEC-801 ET-5, EF-4).

The pack reuses the review session of the day, replaces the public payloads by the full version
payloads (correct answers included) and attaches the recall cards of the notions due tomorrow, one
per notion and twenty at most. Every read runs in the learner's RLS transaction.
"""

import json
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
    create_notion_state,
    create_user,
    one,
)
from learny.assessments.application import offline as offline_service
from learny.shared.db.uow import Database
from learny.shared.time import parse_iso
from learny_api.generated.models import OfflinePackOutput

pytestmark = pytest.mark.spec("SPEC-2202")

TOMORROW_DUE = "2026-11-12T10:00:00Z"
"""Inside the civil day after the fixed clock of the suite (2026-11-11, Paris)."""


async def seed_recall_card(conn: Any, user_id: str, formation_id: str, notion_id: str) -> str:
    """An active recall card of the notion, whose stored payload carries both sides."""
    brick_id = await one(
        conn,
        """
        insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
        values (
          cast(:user as uuid), cast(:formation as uuid), 'recall_card',
          array[cast(:notion as uuid)], 'review', 'active'
        )
        returning id::text as id
        """,
        user=user_id,
        formation=formation_id,
        notion=notion_id,
    )
    version = await one(
        conn,
        """
        insert into public.brick_versions (brick_id, version, payload, origin, created_by)
        values (
          cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor'
        )
        returning id::text as id
        """,
        brick=str(brick_id["id"]),
        payload=json.dumps({"front": "What is a debit?", "back": "A left-side entry.", "sources": []}),
    )
    return str(version["id"])


async def seed_formation(conn: Any, user_id: str, title: str = "Accounting") -> str:
    """One active formation of the learner, with its module, chapter and notion."""
    formation_id = await create_formation(conn, user_id, title=title)
    module_id = await create_module(conn, formation_id, 1, title="Double entry", status="validated")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    await create_notion(conn, formation_id, module_id, chapter_id)
    return formation_id


async def test_a_learner_without_formation_gets_an_empty_pack(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        return await offline_service.build_pack(assessment_deps(tx), actor_for(alice))

    pack = await rolled_back(database, run)
    parsed = OfflinePackOutput.model_validate(pack)
    assert parsed.formations == []
    assert parsed.localDate == "2026-11-11"
    assert parsed.expiresAt == "2026-11-12T23:00:00.000Z"


async def test_the_pack_carries_the_full_payload_of_the_extra_cards(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        formation_id = await seed_formation(tx.conn, alice)
        notion_id = str(
            (
                await one(
                    tx.conn,
                    "select id::text as id from public.notions where formation_id = cast(:f as uuid)",
                    f=formation_id,
                )
            )["id"]
        )
        version_id = await seed_recall_card(tx.conn, alice, formation_id, notion_id)
        await create_notion_state(tx.conn, alice, notion_id, due_at=parse_iso(TOMORROW_DUE), in_review=True)
        pack = await offline_service.build_pack(assessment_deps(tx), actor_for(alice))
        return pack, version_id, notion_id

    pack, version_id, notion_id = await rolled_back(database, run)
    parsed = OfflinePackOutput.model_validate(pack)
    assert len(parsed.formations) == 1
    formation = parsed.formations[0]
    assert formation.session.items == []
    assert len(formation.extraCards) == 1
    card = formation.extraCards[0]
    assert card.brickVersionId == version_id
    assert card.notionId == notion_id
    assert card.payload["front"] == "What is a debit?"
    assert card.payload["back"] == "A left-side entry."


async def test_the_pack_never_lists_more_than_three_formations(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        for index in range(4):
            await seed_formation(tx.conn, alice, title=f"Formation {index}")
        return await offline_service.build_pack(assessment_deps(tx), actor_for(alice))

    pack = await rolled_back(database, run)
    parsed = OfflinePackOutput.model_validate(pack)
    assert len(parsed.formations) == 3


async def test_the_pack_of_another_learner_stays_invisible(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        formation_id = await seed_formation(tx.conn, bob, title="Bob accounting")
        pack = await offline_service.build_pack(assessment_deps(tx), actor_for(alice))
        return pack, formation_id

    pack, formation_id = await rolled_back(database, run)
    parsed = OfflinePackOutput.model_validate(pack)
    assert parsed.formations == []
    assert formation_id


async def test_the_pack_ignores_a_completed_formation(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        active = await seed_formation(tx.conn, alice, title="Active")
        completed = await create_formation(tx.conn, alice, title="Completed", status="completed")
        pack = await offline_service.build_pack(assessment_deps(tx), actor_for(alice))
        return pack, active, completed

    pack, active, completed = await rolled_back(database, run)
    parsed = OfflinePackOutput.model_validate(pack)
    assert [formation.formationId for formation in parsed.formations] == [active]
    assert completed
