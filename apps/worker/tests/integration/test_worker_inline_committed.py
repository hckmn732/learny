"""[SPEC-2102] `JOBS_MODE=inline`: the API runs the events a request committed before answering.

P21 plan, step 6: the committed events are fanned out and executed through the same `job_deliveries`
rows as with the worker, depth first, delays ignored, a failed attempt retried at once. Every event
created by a test is deleted afterwards.
"""

import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

import pytest
from learny.shared.clock import Clock
from learny.shared.db.uow import Database, collect_committed_events
from learny.shared.outbox.events import Event
from learny.shared.time import parse_iso
from learny_worker.consumers import Consumer
from learny_worker.dispatcher import Dispatcher
from learny_worker.inline import run_committed
from learny_worker.runner import Runner
from sqlalchemy import text
from support.fakes import FakeClock, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2102")

FIXED = parse_iso("2026-11-11T12:20:00Z")
FIRST_EVENT = "sdd/demo-requested"
SECOND_EVENT = "sdd/inline-follow-up"


@dataclass
class Deps:
    db: Database
    clock: Clock
    logger: RecordingLogger
    settings: Any = None


@dataclass
class Recorder:
    runs: list[str] = field(default_factory=list)
    fail_first: bool = False

    async def run(self, _deps: Any, event: Event) -> None:
        self.runs.append(event.event_id)
        if self.fail_first and len(self.runs) == 1:
            raise RuntimeError("first attempt fails")


@pytest.fixture
async def events(database: Database) -> AsyncIterator[list[str]]:
    created: list[str] = []
    yield created
    async with database.service_tx() as tx:
        for event_id in created:
            await tx.conn.execute(
                text("delete from public.event_outbox where event_id = :id"), {"id": event_id}
            )


def loops(database: Database, *consumers: Consumer) -> tuple[Dispatcher, Runner]:
    deps = Deps(db=database, clock=FakeClock(FIXED), logger=RecordingLogger())
    return Dispatcher(deps, consumers=consumers), Runner(deps, consumers)


async def delivery(database: Database, event_id: str, consumer: str) -> dict[str, Any]:
    async with database.service_tx() as tx:
        row = (
            (
                await tx.conn.execute(
                    text(
                        "select status, attempts from public.job_deliveries"
                        " where event_id = :id and consumer = :consumer"
                    ),
                    {"id": event_id, "consumer": consumer},
                )
            )
            .mappings()
            .first()
        )
    return dict(row) if row is not None else {}


async def emit_then_fail(database: Database, event_id: str) -> None:
    """A transaction that writes an event and rolls back."""
    async with database.service_tx() as tx:
        await tx.emit(FIRST_EVENT, {"n": 2}, event_id=event_id)
        raise RuntimeError("rollback")


def new_id(created: list[str]) -> str:
    event_id = f"spec-2102-inline:{uuid.uuid4()}"
    created.append(event_id)
    return event_id


async def test_only_committed_events_are_collected(events: list[str], database: Database) -> None:
    committed = new_id(events)
    rolled_back = new_id(events)
    with collect_committed_events() as collected:
        async with database.service_tx() as tx:
            await tx.emit(FIRST_EVENT, {"n": 1}, event_id=committed)
        with pytest.raises(RuntimeError):
            await emit_then_fail(database, rolled_back)
    assert collected == [committed]

    # Outside a collector nothing is recorded (the worker and production paths).
    async with database.service_tx() as tx:
        await tx.emit(FIRST_EVENT, {"n": 3}, event_id=new_id(events))
    assert collected == [committed]


async def test_committed_events_run_once_through_their_deliveries(
    events: list[str], database: Database
) -> None:
    recorder = Recorder()
    consumer = Consumer(name="devtools.demo_job", on=FIRST_EVENT, run=recorder.run, max_attempts=3)
    dispatcher, runner = loops(database, consumer)
    event_id = new_id(events)
    async with database.service_tx() as tx:
        await tx.emit(FIRST_EVENT, {"n": 1}, event_id=event_id)

    await run_committed(dispatcher, runner, [event_id])

    assert recorder.runs == [event_id]
    assert await delivery(database, event_id, consumer.name) == {"status": "done", "attempts": 1}
    # The event is stamped: the worker dispatcher never fans it out a second time.
    assert await dispatcher.dispatch_events([event_id]) == 0


async def test_follow_up_events_delays_and_retries(events: list[str], database: Database) -> None:
    follow_up = new_id(events)

    async def first(deps: Any, event: Event) -> None:
        async with deps.db.service_tx() as tx:
            await tx.emit(SECOND_EVENT, {"from": event.event_id}, event_id=follow_up)

    def tomorrow(_event: Event, clock: Clock) -> datetime:
        return clock.now() + timedelta(days=1)

    second = Recorder(fail_first=True)
    emitter = Consumer(name="inline.first", on=FIRST_EVENT, run=first)
    delayed = Consumer(name="inline.second", on=SECOND_EVENT, run=second.run, run_at=tomorrow, max_attempts=3)
    dispatcher, runner = loops(database, emitter, delayed)
    event_id = new_id(events)
    async with database.service_tx() as tx:
        await tx.emit(FIRST_EVENT, {"n": 1}, event_id=event_id)

    await run_committed(dispatcher, runner, [event_id])

    # The follow-up ran in the same call although it was scheduled tomorrow, and its failed first
    # attempt was retried at once.
    assert second.runs == [follow_up, follow_up]
    assert await delivery(database, event_id, "inline.first") == {"status": "done", "attempts": 1}
    assert await delivery(database, follow_up, "inline.second") == {"status": "done", "attempts": 2}


async def test_worker_only_consumers_are_left_for_the_worker(events: list[str], database: Database) -> None:
    inline = Recorder()
    worker_only = Recorder()
    inline_consumer = Consumer(name="inline.first", on=FIRST_EVENT, run=inline.run)
    export_consumer = Consumer(name="privacy.run_data_export", on=FIRST_EVENT, run=worker_only.run)
    dispatcher, runner = loops(database, inline_consumer, export_consumer)
    event_id = new_id(events)
    async with database.service_tx() as tx:
        await tx.emit(FIRST_EVENT, {"n": 1}, event_id=event_id)

    await run_committed(dispatcher, runner, [event_id], exclude=("privacy.run_data_export",))

    assert inline.runs == [event_id]
    assert worker_only.runs == []
    assert await delivery(database, event_id, "inline.first") == {"status": "done", "attempts": 1}
    assert await delivery(database, event_id, "privacy.run_data_export") == {
        "status": "pending",
        "attempts": 0,
    }
