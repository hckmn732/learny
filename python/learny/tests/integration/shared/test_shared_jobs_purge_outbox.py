"""[SPEC-2207] The nightly outbox cleanup against the local stack.

The rows delivered more than seven days ago are deleted, their `job_deliveries` cascade, and the
rows that were never dispatched stay. A replay of the same tick deletes nothing, which is the
idempotence the consumer relies on.
"""

import json
from datetime import datetime
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.learning_deps import learning_deps
from learny.shared.db.uow import Database
from learny.shared.outbox.purge import OUTBOX_RETENTION_DAYS, purge_outbox
from learny.shared.time import parse_iso
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

NOW = parse_iso("2026-11-11T12:20:00Z")

INSERT_EVENT = text(
    """
    insert into public.event_outbox
      (event_id, name, data, user_id, created_at, sent_at, dispatched_at)
    values (
      :event_id, 'quiz/submitted', cast(:data as jsonb), null,
      cast(:created as timestamptz), cast(:sent as timestamptz), cast(:dispatched as timestamptz)
    )
    """
)
INSERT_DELIVERY = text(
    """
    insert into public.job_deliveries (event_id, consumer, status, run_after, completed_at)
    values (:event_id, 'assessments.grade_quiz', 'done', cast(:at as timestamptz),
            cast(:at as timestamptz))
    """
)
COUNT_EVENTS = text("select count(*)::int as count from public.event_outbox where event_id like :prefix")
COUNT_DELIVERIES = text(
    "select count(*)::int as count from public.job_deliveries where event_id like :prefix"
)
EVENTS_LIKE = text("select event_id from public.event_outbox where event_id like :prefix order by event_id")


async def seed_event(
    tx: Any,
    event_id: str,
    *,
    created: datetime,
    sent: datetime | None,
    dispatched: datetime | None,
) -> None:
    await tx.conn.execute(
        INSERT_EVENT,
        {
            "event_id": event_id,
            "data": json.dumps({"attemptId": event_id}),
            "created": created,
            "sent": sent,
            "dispatched": dispatched,
        },
    )
    await tx.conn.execute(INSERT_DELIVERY, {"event_id": event_id, "at": created})


async def count(conn: Any, statement: Any, **parameters: Any) -> int:
    return int((await conn.execute(statement, parameters)).mappings().all()[0]["count"])


async def test_delivered_rows_older_than_seven_days_are_deleted_and_their_deliveries_cascade(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        prefix = "outbox-cleanup-"
        day = 24 * 3600
        await seed_event(
            tx,
            f"{prefix}old",
            created=datetime.fromtimestamp(NOW.timestamp() - 9 * day, tz=NOW.tzinfo),
            sent=datetime.fromtimestamp(NOW.timestamp() - (OUTBOX_RETENTION_DAYS + 1) * day, tz=NOW.tzinfo),
            dispatched=None,
        )
        await seed_event(
            tx,
            f"{prefix}dispatched-old",
            created=datetime.fromtimestamp(NOW.timestamp() - 9 * day, tz=NOW.tzinfo),
            sent=None,
            dispatched=datetime.fromtimestamp(
                NOW.timestamp() - (OUTBOX_RETENTION_DAYS + 1) * day, tz=NOW.tzinfo
            ),
        )
        await seed_event(
            tx,
            f"{prefix}recent",
            created=datetime.fromtimestamp(NOW.timestamp() - day, tz=NOW.tzinfo),
            sent=datetime.fromtimestamp(NOW.timestamp() - day, tz=NOW.tzinfo),
            dispatched=None,
        )
        await seed_event(tx, f"{prefix}pending", created=NOW, sent=None, dispatched=None)
        deps = learning_deps(tx, now=NOW)

        deleted = await purge_outbox(deps)

        assert deleted >= 2
        assert await count(tx.conn, COUNT_EVENTS, prefix=f"{prefix}%") == 2
        remaining = (await tx.conn.execute(EVENTS_LIKE, {"prefix": f"{prefix}%"})).mappings().all()
        assert [row["event_id"] for row in remaining] == [f"{prefix}pending", f"{prefix}recent"]
        # the foreign key cascades: no delivery outlives its event
        assert await count(tx.conn, COUNT_DELIVERIES, prefix=f"{prefix}%") == 2

    await rolled_back(database, run)


async def test_a_replayed_tick_deletes_nothing(database: Database) -> None:
    async def run(tx: Any) -> None:
        prefix = "outbox-replay-"
        day = 24 * 3600
        await seed_event(
            tx,
            f"{prefix}old",
            created=datetime.fromtimestamp(NOW.timestamp() - 8 * day, tz=NOW.tzinfo),
            sent=datetime.fromtimestamp(NOW.timestamp() - 8 * day, tz=NOW.tzinfo),
            dispatched=None,
        )
        deps = learning_deps(tx, now=NOW)

        first = await purge_outbox(deps)
        second = await purge_outbox(deps)

        assert first >= 1
        assert second == 0
        assert await count(tx.conn, COUNT_EVENTS, prefix=f"{prefix}%") == 0

    await rolled_back(database, run)
