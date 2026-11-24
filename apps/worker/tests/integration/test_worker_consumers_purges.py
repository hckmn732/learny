"""[SPEC-2207] Purges of the plan (nightly and hourly) consumed by the real worker.

An emitted `cron/nightly` or `cron/hourly-tick` reaches the consumer of the registry through the
dispatcher and the runner; the effect is the deletion of the expired rows only, once: a replay of
the same tick runs no consumer and deletes nothing more.
"""

from datetime import timedelta
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import FIXED, create_user
from learny.shared.db.uow import Database, Tx
from sqlalchemy import text
from support.jobs import count, delivery, emit_event, harness, outbox_event

pytestmark = pytest.mark.spec("SPEC-2207")

DAY = timedelta(days=1)


async def deliver(tx: Tx, event_id: str, sent_at: Any) -> None:
    """Marks one outbox row as delivered at `sent_at`, with its completed delivery."""
    await tx.conn.execute(
        text("update public.event_outbox set sent_at = :sent, dispatched_at = :sent where event_id = :id"),
        {"sent": sent_at, "id": event_id},
    )
    await tx.conn.execute(
        text(
            "insert into public.job_deliveries (event_id, consumer, status, run_after, completed_at) "
            "values (:id, 'shared.purge_outbox', 'done', :sent, :sent)"
        ),
        {"id": event_id, "sent": sent_at},
    )


async def seed_delivered_event(tx: Tx, event_id: str, *, age: timedelta) -> None:
    await tx.emit("user/local-tick", {"userId": "old"}, event_id=event_id)
    await deliver(tx, event_id, FIXED - age)


async def test_a_nightly_tick_purges_the_delivered_outbox_once(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        old = "spec-2207:outbox-old"
        await seed_delivered_event(tx, old, age=timedelta(days=8))
        tick = await emit_event(tx, "cron/nightly", {"runDate": "2026-11-10"}, "spec-2207:nightly-outbox")
        worker = harness(tx, ("shared.purge_outbox",))

        first = await worker.drain()
        deleted = await outbox_event(tx, old)
        cascaded = await count(
            tx, "select count(*)::int from public.job_deliveries where event_id = :id", id=old
        )
        state = await delivery(tx, tick, "shared.purge_outbox")

        # A new delivered row after the tick: a replayed tick must not delete it.
        survivor = "spec-2207:outbox-survivor"
        await seed_delivered_event(tx, survivor, age=timedelta(days=8))
        second = await worker.drain()
        survivor_row = await outbox_event(tx, survivor)
        return {
            "first": first,
            "deleted": deleted,
            "cascaded": cascaded,
            "state": state,
            "second": second,
            "survivor": survivor_row,
        }

    result = await rolled_back(database, run)

    assert result["first"][1] == 1
    assert result["deleted"] is None
    assert result["cascaded"] == 0
    assert result["state"] is not None
    assert result["state"]["status"] == "done"
    assert result["second"][1] == 0
    assert result["survivor"] is not None


async def test_a_nightly_tick_purges_the_offline_receipts_once(database: Database) -> None:
    insert_receipt = text(
        "insert into public.offline_sync_receipts (user_id, client_id, status, created_at) "
        "values (cast(:user as uuid), gen_random_uuid(), 'applied', :created) returning client_id::text as id"
    )

    async def run(tx: Tx) -> dict[str, Any]:
        user = await create_user(tx.conn, "Purge")
        old = (
            await tx.conn.execute(insert_receipt, {"user": user, "created": FIXED - 31 * DAY})
        ).scalar_one()
        recent = (
            await tx.conn.execute(insert_receipt, {"user": user, "created": FIXED - 29 * DAY})
        ).scalar_one()
        tick = await emit_event(tx, "cron/nightly", {"runDate": "2026-11-10"}, "spec-2207:nightly-receipts")
        worker = harness(tx, ("assessments.purge_offline_receipts",))

        first = await worker.drain()
        remaining = [
            str(row[0])
            for row in (
                await tx.conn.execute(
                    text(
                        "select client_id::text from public.offline_sync_receipts "
                        "where user_id = cast(:user as uuid) order by client_id"
                    ),
                    {"user": user},
                )
            ).all()
        ]
        state = await delivery(tx, tick, "assessments.purge_offline_receipts")
        second = await worker.drain()
        return {
            "first": first,
            "remaining": remaining,
            "old": str(old),
            "recent": str(recent),
            "state": state,
            "second": second,
        }

    result = await rolled_back(database, run)

    assert result["first"][1] == 1
    assert result["remaining"] == [result["recent"]]
    assert result["state"] is not None
    assert result["state"]["status"] == "done"
    assert result["second"][1] == 0


async def test_an_hourly_tick_purges_the_security_rows_once(database: Database) -> None:
    insert_key = text(
        "insert into public.idempotency_keys (key, user_id, route, request_hash, created_at) "
        "values (:key, cast(:user as uuid), 'spec-2207', :hash, :created)"
    )
    insert_bucket = text(
        "insert into public.rate_limits (bucket, tokens, updated_at) values (:bucket, 1, :updated)"
    )

    async def run(tx: Tx) -> dict[str, Any]:
        user = await create_user(tx.conn, "Purge")
        digest = "0" * 64
        old_key = {"user": user, "hash": digest, "created": FIXED - 25 * timedelta(hours=1)}
        recent_key = {"user": user, "hash": digest, "created": FIXED - 23 * timedelta(hours=1)}
        await tx.conn.execute(insert_key, {"key": "spec-2207-old", **old_key})
        await tx.conn.execute(insert_key, {"key": "spec-2207-recent", **recent_key})
        await tx.conn.execute(
            insert_bucket, {"bucket": "spec-2207-old", "updated": FIXED - 25 * timedelta(hours=1)}
        )
        await tx.conn.execute(
            insert_bucket, {"bucket": "spec-2207-recent", "updated": FIXED - 23 * timedelta(hours=1)}
        )
        tick = await emit_event(
            tx,
            "cron/hourly-tick",
            {"tickAt": "2026-11-11T12:05:00.000Z"},
            "spec-2207:hourly-security",
        )
        worker = harness(tx, ("identity.purge_security_rows",))

        first = await worker.drain()
        keys = [
            str(row[0])
            for row in (
                await tx.conn.execute(
                    text("select key from public.idempotency_keys where key like 'spec-2207-%' order by key")
                )
            ).all()
        ]
        buckets = [
            str(row[0])
            for row in (
                await tx.conn.execute(
                    text(
                        "select bucket from public.rate_limits "
                        "where bucket like 'spec-2207-%' order by bucket"
                    )
                )
            ).all()
        ]
        state = await delivery(tx, tick, "identity.purge_security_rows")
        second = await worker.drain()
        return {"first": first, "keys": keys, "buckets": buckets, "state": state, "second": second}

    result = await rolled_back(database, run)

    assert result["first"][1] == 1
    assert result["keys"] == ["spec-2207-recent"]
    assert result["buckets"] == ["spec-2207-recent"]
    assert result["state"] is not None
    assert result["state"]["status"] == "done"
    assert result["second"][1] == 0
