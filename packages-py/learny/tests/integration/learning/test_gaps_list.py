"""[SPEC-615] `GET /api/v1/formations/{id}/gaps` on the local stack.

The driver returns `timestamptz` columns as `datetime`: the card's `detectedAt` is the ISO instant
of the detection, like `new Date(row.detected_at).toISOString()`.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_notion_state,
    create_user,
)
from factories.learning_deps import learning_deps
from learny.learning import public as learning
from learny.shared.db.uow import Database
from learny_api.generated.models import GapsListOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-615")


async def test_open_gap_cards_carry_the_detection_instant(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        module_id = await create_module(tx.conn, formation_id, 1)
        chapter_id = await create_chapter(tx.conn, formation_id, module_id)
        notion_id = await create_notion(tx.conn, formation_id, module_id, chapter_id)
        await create_notion_state(tx.conn, alice, notion_id, gap_nature="forgetting")
        await tx.conn.execute(
            text(
                "update public.notion_states set gap_detected_at = '2026-11-09T08:30:00Z'"
                " where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid)"
            ),
            {"user": alice, "notion": notion_id},
        )
        return await learning.list_gaps(learning_deps(tx), actor_for(alice), formation_id, None)

    payload = await rolled_back(database, run)

    parsed = GapsListOutput.model_validate(payload)
    assert parsed.countsByNature.forgetting == 1
    assert [item.detectedAt for item in parsed.items] == ["2026-11-09T08:30:00.000Z"]
