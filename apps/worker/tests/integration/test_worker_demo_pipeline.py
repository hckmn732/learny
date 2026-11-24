"""[SPEC-2207] The demonstration consumer on the local stack: steps, retry switch, replay.

`sdd-demo-pipeline` used to write the three steps of a demonstration run in `sdd_demo_runs`. The
Python worker owns that consumer now, so the SPEC-203 page reads the same state as before the
cutover. Everything runs inside the service transaction `rolled_back` reverts: no row survives and
the shared database keeps its seed.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

import pytest
from factories.db_support import rolled_back
from learny.shared.clock import FixedClock
from learny.shared.db.uow import Database, Tx
from learny.shared.outbox.events import Event
from learny.shared.time import parse_iso
from learny_worker.consumers import DEMO_EVENT, demo_job
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

FIXED = datetime(2026, 11, 11, 12, 20, tzinfo=UTC)
READ_RUN = text(
    "select steps, attempts, finished_at from public.sdd_demo_runs where run_id = cast(:run as uuid)"
)
DELETE_RUN = text("delete from public.sdd_demo_runs where run_id = cast(:run as uuid)")


class RecordingLogger:
    def __init__(self) -> None:
        self.lines: list[tuple[str, dict[str, Any]]] = []

    def _record(self, message: str, **fields: Any) -> None:
        self.lines.append((message, fields))

    def info(self, message: str, **fields: Any) -> None:
        self._record(message, **fields)

    def warning(self, message: str, **fields: Any) -> None:
        self._record(message, **fields)

    def messages(self) -> list[str]:
        return [message for message, _ in self.lines]


class DemoTransactions:
    """The demonstration consumer opens one service transaction: it reuses the seed one."""

    def __init__(self, tx: Tx) -> None:
        self._tx = tx

    @asynccontextmanager
    async def service_tx(self) -> AsyncIterator[Tx]:
        yield self._tx


class DemoDeps:
    def __init__(self, tx: Tx, logger: RecordingLogger) -> None:
        self.db = DemoTransactions(tx)
        self.clock = FixedClock(FIXED)
        self.logger = logger


def demo_event(run_id: str, fail_once_at: str = "none") -> Event:
    return Event(
        event_id=f"sdd-demo:{run_id}",
        name=DEMO_EVENT,
        data={"runId": run_id, "failOnceAt": fail_once_at},
        user_id=None,
        created_at=parse_iso("2026-11-11T12:20:00Z"),
    )


async def run_and_read(database: Database, run_id: str, fail_once_at: str = "none") -> dict[str, Any]:
    logger = RecordingLogger()
    return await rolled_back(
        database,
        lambda tx: _consume(tx, run_id, fail_once_at, logger),
    )


async def _consume(tx: Tx, run_id: str, fail_once_at: str, logger: RecordingLogger) -> dict[str, Any]:
    deps = DemoDeps(tx, logger)
    try:
        await demo_job(deps, demo_event(run_id, fail_once_at))
        row = (await tx.conn.execute(READ_RUN, {"run": run_id})).mappings().first()
        return {"row": dict(row) if row is not None else {}, "messages": logger.messages()}
    finally:
        await tx.conn.execute(DELETE_RUN, {"run": run_id})


async def test_the_demo_consumer_records_the_three_steps(database: Database) -> None:
    outcome = await run_and_read(database, "11111111-1111-4111-8111-111111111111")
    row = outcome["row"]
    assert [step["name"] for step in row["steps"]] == [
        "step-1-prepare",
        "step-2-process",
        "step-3-finish",
    ]
    assert row["attempts"] == 1
    assert row["finished_at"] is not None
    assert outcome["messages"][-1] == "demo job consumed"


async def test_the_demo_switch_fails_the_second_step_once(database: Database) -> None:
    outcome = await run_and_read(database, "22222222-2222-4222-8222-222222222222", fail_once_at="step-2")
    assert outcome["row"]["attempts"] == 2
    assert "demo step failed once" in outcome["messages"]
    assert len(outcome["row"]["steps"]) == 3


async def test_a_replayed_demo_event_changes_nothing(database: Database) -> None:
    run_id = "33333333-3333-4333-8333-333333333333"
    logger = RecordingLogger()

    async def consume(tx: Tx) -> dict[str, Any]:
        deps = DemoDeps(tx, logger)
        await demo_job(deps, demo_event(run_id))
        first = dict((await tx.conn.execute(READ_RUN, {"run": run_id})).mappings().first() or {})
        await demo_job(deps, demo_event(run_id))
        second = dict((await tx.conn.execute(READ_RUN, {"run": run_id})).mappings().first() or {})
        await tx.conn.execute(DELETE_RUN, {"run": run_id})
        return {"first": first, "second": second}

    outcome = await rolled_back(database, consume)
    assert outcome["second"]["attempts"] == outcome["first"]["attempts"] == 1
    assert outcome["second"]["finished_at"] == outcome["first"]["finished_at"]
    assert [step["name"] for step in outcome["second"]["steps"]] == [
        "step-1-prepare",
        "step-2-process",
        "step-3-finish",
    ]
