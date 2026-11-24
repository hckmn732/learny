"""[SPEC-2207] The nightly purge of the offline synchronisation receipts.

The receipts created more than thirty days ago are deleted, the recent ones stay, and a replayed
tick deletes nothing. The fixture mirrors `packages/db/test` `purgeOfflineReceipts` and the
`offline-receipts-purge` function (SPEC-801 ET-6, ADR-0200).
"""

from datetime import datetime
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import create_user
from factories.learning_deps import learning_deps
from learny.assessments.application.offline_purge import purge_offline_receipts
from learny.shared.db.uow import Database
from learny.shared.time import parse_iso
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

NOW = parse_iso("2026-11-11T12:20:00Z")
DAY_SECONDS = 24 * 3600

INSERT_RECEIPT = text(
    """
    insert into public.offline_sync_receipts (user_id, client_id, status, created_at)
    values (
      cast(:user as uuid), cast(:client as uuid), 'applied', cast(:created as timestamptz)
    )
    """
)
CLIENTS = text(
    "select client_id::text as client_id from public.offline_sync_receipts "
    "where user_id = cast(:user as uuid) order by client_id"
)


def at(age_seconds: int) -> datetime:
    return datetime.fromtimestamp(NOW.timestamp() - age_seconds, tz=NOW.tzinfo)


async def test_receipts_older_than_thirty_days_are_deleted(database: Database) -> None:
    async def run(tx: Any) -> None:
        user_id = await create_user(tx.conn, "Quitterie")
        old_client = "11111111-1111-4111-8111-111111111111"
        edge_client = "22222222-2222-4222-8222-222222222222"
        recent_client = "33333333-3333-4333-8333-333333333333"
        for client, age in (
            (old_client, 31 * DAY_SECONDS),
            (edge_client, 30 * DAY_SECONDS),
            (recent_client, DAY_SECONDS),
        ):
            await tx.conn.execute(INSERT_RECEIPT, {"user": user_id, "client": client, "created": at(age)})
        deps = learning_deps(tx, now=NOW)

        deleted = await purge_offline_receipts(deps)

        assert deleted >= 1
        remaining = (await tx.conn.execute(CLIENTS, {"user": user_id})).mappings().all()
        assert [row["client_id"] for row in remaining] == sorted([edge_client, recent_client])

    await rolled_back(database, run)


async def test_a_replayed_nightly_tick_deletes_nothing(database: Database) -> None:
    async def run(tx: Any) -> None:
        user_id = await create_user(tx.conn, "Raphaelle")
        client = "44444444-4444-4444-8444-444444444444"
        await tx.conn.execute(
            INSERT_RECEIPT, {"user": user_id, "client": client, "created": at(40 * DAY_SECONDS)}
        )
        deps = learning_deps(tx, now=NOW)

        first = await purge_offline_receipts(deps)
        second = await purge_offline_receipts(deps)

        assert first >= 1
        assert second == 0
        assert (await tx.conn.execute(CLIENTS, {"user": user_id})).mappings().all() == []

    await rolled_back(database, run)
