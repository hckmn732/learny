"""[SPEC-2207] The scheduler tasks on the local stack: one leader, one tick per period.

The advisory lock of SPEC-2102 elects a single instance; the two new tasks write the hourly tick,
its local ticks and the nightly tick into the outbox. The writes happen in the service transaction
`rolled_back` reverts, while the lock takes its own connection: the election is real and the data is
cleaned. Whatever the number of instances, the event identifiers make a second tick a no-op.
"""

import asyncio
from datetime import UTC, datetime
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import EngagementTransactions, engagement_deps
from factories.identity_support import create_user
from learny.shared.db.uow import Database
from learny_worker.scheduler import Scheduler
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

TICK = datetime(2026, 11, 11, 5, 5, tzinfo=UTC)
ACTIVE_USER = text(
    "update public.profiles set onboarding_step = 'done', timezone = 'Europe/Paris' "
    "where id = cast(:user as uuid)"
)
COUNT_EVENTS = text("select count(*)::int from public.event_outbox where event_id = :id")
HOURLY_EVENTS = text(
    "select event_id from public.event_outbox where name = 'cron/hourly-tick' order by event_id"
)
NIGHTLY_EVENTS = text(
    "select event_id from public.event_outbox where name = 'cron/nightly' order by event_id"
)


class LockableTransactions(EngagementTransactions):
    """The savepoint transactions of the suite, plus the real engine of the advisory lock."""

    def __init__(self, tx: Any, engine: Any) -> None:
        super().__init__(tx)
        self.engine = engine


def lockable_deps(tx: Any, engine: Any, now: datetime) -> Any:
    deps = engagement_deps(tx, now=now)
    deps.db = LockableTransactions(tx, engine)
    return deps


async def active_learner(tx: Any, first_name: str) -> str:
    user = await create_user(tx.conn, first_name, timezone="Europe/Paris")
    await tx.conn.execute(ACTIVE_USER, {"user": user})
    return user


def scheduler(tx: Any, engine: Any, now: datetime = TICK, *, poll: float = 60.0) -> Scheduler:
    return Scheduler(
        lockable_deps(tx, engine, now),
        retry_interval_s=0.05,
        poll_interval_s=poll,
    )


async def test_two_schedulers_emit_a_single_tick_for_a_period(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        user = await active_learner(tx, "Jules")
        first = scheduler(tx, database.engine)
        second = scheduler(tx, database.engine)

        first_ids = await first.emit_due()
        hourly = [str(row[0]) for row in (await tx.conn.execute(HOURLY_EVENTS)).all()]
        nightly = [str(row[0]) for row in (await tx.conn.execute(NIGHTLY_EVENTS)).all()]
        ticks = await tx.conn.execute(
            text(
                "select event_id, data from public.event_outbox "
                "where name = 'user/local-tick' and data->>'userId' = :user"
            ),
            {"user": user},
        )
        local = [(str(row[0]), dict(row[1])) for row in ticks.all()]

        again = await first.emit_due()
        # A second instance waking up in the same period emits the same identifiers: the outbox
        # primary key is the guard, so nothing is duplicated.
        other = await second.emit_due()
        hourly_after = [str(row[0]) for row in (await tx.conn.execute(HOURLY_EVENTS)).all()]
        nightly_after = [str(row[0]) for row in (await tx.conn.execute(NIGHTLY_EVENTS)).all()]
        ticks_after = await tx.conn.execute(
            text(
                "select count(*)::int from public.event_outbox "
                "where name = 'user/local-tick' and data->>'userId' = :user"
            ),
            {"user": user},
        )
        return {
            "first_ids": first_ids,
            "hourly": hourly,
            "nightly": nightly,
            "local": local,
            "again": again,
            "other": other,
            "hourly_after": hourly_after,
            "nightly_after": nightly_after,
            "local_after": int(ticks_after.scalar_one()),
        }

    result = await rolled_back(database, run)

    assert result["first_ids"] == [
        "hourly-tick:2026-11-11T05:05:00.000Z",
        "nightly:2026-11-11",
    ]
    assert result["hourly"] == ["hourly-tick:2026-11-11T05:05:00.000Z"]
    assert result["nightly"] == ["nightly:2026-11-11"]
    assert [identifier for identifier, _ in result["local"]] == [
        f"local-tick:{result['local'][0][1]['userId']}:2026-11-11T05:00:00.000Z"
    ]
    assert result["local"][0][1]["windowStart"] == "2026-11-11T05:00:00.000Z"
    assert result["local"][0][1]["windowEnd"] == "2026-11-11T06:00:00.000Z"
    assert result["again"] == []
    assert result["other"] == result["first_ids"]
    assert result["hourly_after"] == result["hourly"]
    assert result["nightly_after"] == result["nightly"]
    assert result["local_after"] == 1


async def test_only_the_leader_runs_the_new_tasks(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        await active_learner(tx, "Karim")
        first = scheduler(tx, database.engine)
        second = scheduler(tx, database.engine)
        stop = asyncio.Event()
        tasks = [
            asyncio.create_task(first.run(stop), name="first"),
            asyncio.create_task(second.run(stop), name="second"),
        ]
        leaders: list[Scheduler] = []
        try:
            for _ in range(200):
                if first.is_leader != second.is_leader:
                    break
                await asyncio.sleep(0.02)
            leaders = [instance for instance in (first, second) if instance.is_leader]
            # The leader runs the hourly task at once; the standby retries and emits nothing.
            for _ in range(200):
                hourly = (await tx.conn.execute(HOURLY_EVENTS)).all()
                nightly = (await tx.conn.execute(NIGHTLY_EVENTS)).all()
                if hourly and nightly:
                    break
                await asyncio.sleep(0.02)
            hourly_rows = [str(row[0]) for row in (await tx.conn.execute(HOURLY_EVENTS)).all()]
            nightly_rows = [str(row[0]) for row in (await tx.conn.execute(NIGHTLY_EVENTS)).all()]
        finally:
            stop.set()
            await asyncio.gather(*tasks, return_exceptions=True)
        return {
            "leaders": [instance is first for instance in leaders],
            "hourly": hourly_rows,
            "nightly": nightly_rows,
            "standby": first.is_leader or second.is_leader,
        }

    result = await rolled_back(database, run)

    assert len(result["leaders"]) == 1
    assert result["hourly"] == ["hourly-tick:2026-11-11T05:05:00.000Z"]
    assert result["nightly"] == ["nightly:2026-11-11"]
    assert result["standby"] is False
