"""[SPEC-2102] Durable worker on the local stack: fan-out, crash, concurrency, duplicates.

CA-1 (one effect per event through crash, concurrency and duplicate delivery) and CA-2 (one scheduler
among two instances). Every event created by
a test is deleted afterwards, with its deliveries (`on delete cascade`).
"""

import asyncio
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import pytest
from factories.db_support import failure_code
from learny.shared.clock import Clock
from learny.shared.db.uow import Database
from learny.shared.outbox import deliveries as outbox
from learny.shared.outbox.events import Event
from learny.shared.time import parse_iso
from learny_worker.consumers import Consumer
from learny_worker.dispatcher import Dispatcher
from learny_worker.runner import Runner
from learny_worker.scheduler import Scheduler
from sqlalchemy import text
from support.fakes import FakeClock, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2102")

FIXED = parse_iso("2026-11-11T12:20:00Z")
DEMO_EVENT = "sdd/demo-requested"
DEMO_CONSUMER = "devtools.demo_job"


@dataclass
class Counter:
    runs: int = 0
    delay: float = 0.0
    observations: list[str] = field(default_factory=list)

    async def run(self, _deps: Any, event: Event) -> None:
        self.runs += 1
        self.observations.append(event.event_id)
        if self.delay:
            await asyncio.sleep(self.delay)


@dataclass
class Deps:
    db: Database
    clock: Clock
    logger: RecordingLogger
    settings: Any = None


def consumer(counter: Counter, *, name: str = DEMO_CONSUMER, timeout_s: int = 10) -> Consumer:
    return Consumer(name=name, on=DEMO_EVENT, run=counter.run, timeout_s=timeout_s, max_attempts=3)


def deps(database: Database) -> Deps:
    return Deps(db=database, clock=FakeClock(FIXED), logger=RecordingLogger())


@pytest.fixture
async def events(database: Database) -> AsyncIterator[list[str]]:
    """Collects the event identifiers of a test and deletes them, with their deliveries, after."""
    created: list[str] = []
    yield created
    async with database.service_tx() as tx:
        for event_id in created:
            await tx.conn.execute(
                text("delete from public.event_outbox where event_id = :id"), {"id": event_id}
            )


async def emit(database: Database, created: list[str], data: dict[str, Any] | None = None) -> str:
    """Writes one event with a unique identifier (the outbox is shared with the other suites)."""
    event_id = f"spec-2102:{uuid.uuid4()}"
    payload = {"runId": str(uuid.uuid4()), "failOnceAt": "none"} if data is None else data
    async with database.service_tx() as tx:
        await tx.emit(DEMO_EVENT, payload, event_id=event_id)
    created.append(event_id)
    return event_id


async def delivery(database: Database, event_id: str, name: str = DEMO_CONSUMER) -> dict[str, Any]:
    async with database.service_tx() as tx:
        rows = (
            (
                await tx.conn.execute(
                    text(
                        "select status, attempts, last_error, completed_at, run_after"
                        " from public.job_deliveries where event_id = :id and consumer = :consumer"
                    ),
                    {"id": event_id, "consumer": name},
                )
            )
            .mappings()
            .all()
        )
    return dict(rows[0]) if rows else {}


async def test_a_dispatched_event_runs_once(events: list[str], database: Database) -> None:
    counter = Counter()
    dispatcher = Dispatcher(deps(database), consumers=(consumer(counter),))
    runner = Runner(deps(database), (consumer(counter),), concurrency=2)

    event_id = await emit(database, events)
    assert await dispatcher.dispatch_once() >= 1
    assert (await delivery(database, event_id))["status"] == "pending"

    # A second dispatch creates nothing: `dispatched_at` is stamped and the primary key guards.
    assert await dispatcher.dispatch_once() == 0
    assert await runner.run_once() >= 1
    row = await delivery(database, event_id)
    assert row["status"] == "done"
    assert row["attempts"] == 1
    assert counter.runs == 1

    # A replayed dispatch and a second run have no effect (CA-1, livraison dupliquee).
    await dispatcher.dispatch_once()
    await runner.run_once()
    assert counter.runs == 1


async def test_a_crashed_worker_reclaims_its_delivery(events: list[str], database: Database) -> None:
    # CL-1: the worker dies after claiming. The claim is made here, without execution, and the
    # lease is expired as the database clock would after the timeout.
    counter = Counter()
    dispatcher = Dispatcher(deps(database), consumers=(consumer(counter),))
    event_id = await emit(database, events)
    await dispatcher.dispatch_once()

    async with database.service_tx() as tx:
        claimed = await outbox.claim(tx, now=FIXED, lease_seconds=1, free_slots=1)
    assert [(item.delivery.event_id, item.delivery.attempts) for item in claimed] == [(event_id, 1)]
    assert (await delivery(database, event_id))["status"] == "running"

    async with database.service_tx() as tx:
        await tx.conn.execute(
            text(
                "update public.job_deliveries set locked_until = now() - interval '1 second'"
                " where event_id = :id"
            ),
            {"id": event_id},
        )

    runner = Runner(deps(database), (consumer(counter),), concurrency=1)
    assert await runner.run_once() == 1
    row = await delivery(database, event_id)
    assert row["status"] == "done"
    assert row["attempts"] == 2
    assert counter.runs == 1


async def test_two_runners_never_share_a_delivery(events: list[str], database: Database) -> None:
    # CL-2: four deliveries, two concurrent runners of concurrency 3, one execution each.
    counter = Counter()
    test_deps = deps(database)
    dispatcher = Dispatcher(test_deps, consumers=(consumer(counter),))
    first = Runner(test_deps, (consumer(counter),), concurrency=3)
    second = Runner(test_deps, (consumer(counter),), concurrency=3)
    identifiers = [await emit(database, events) for _ in range(4)]
    await dispatcher.dispatch_once()

    await asyncio.gather(first.run_once(), second.run_once())

    done = [await delivery(database, identifier) for identifier in identifiers]
    assert [row["status"] for row in done] == ["done"] * 4
    assert [row["attempts"] for row in done] == [1] * 4
    assert sorted(counter.observations) == sorted(identifiers)


async def test_an_invalid_payload_never_runs(events: list[str], database: Database) -> None:
    from learny_worker.consumers import validate_demo_event

    counter = Counter()
    invalid_consumer = Consumer(
        name=DEMO_CONSUMER, on=DEMO_EVENT, run=counter.run, validate=validate_demo_event
    )
    dispatcher = Dispatcher(
        deps(database),
        consumers=(invalid_consumer,),
    )
    event_id = await emit(database, events, {"runId": "not-a-uuid", "failOnceAt": "none"})
    assert await dispatcher.dispatch_once() >= 1
    row = await delivery(database, event_id)
    assert row["status"] == "failed"
    assert "VALIDATION_FAILED" in str(row["last_error"])
    assert counter.runs == 0


async def test_the_stop_event_lets_the_batch_finish(events: list[str], database: Database) -> None:
    # ET-1: SIGTERM stops the claiming, the delivery in flight is completed before the exit.
    counter = Counter(delay=0.2)
    test_deps = deps(database)
    dispatcher = Dispatcher(test_deps, consumers=(consumer(counter),))
    event_id = await emit(database, events)
    await dispatcher.dispatch_once()
    runner = Runner(test_deps, (consumer(counter),), concurrency=1, poll_interval_ms=10)
    stop = asyncio.Event()

    async def stop_soon() -> None:
        await asyncio.sleep(0.05)
        stop.set()

    await asyncio.gather(runner.run(stop), stop_soon())
    row = await delivery(database, event_id)
    assert row["status"] == "done"
    assert counter.runs == 1


async def test_two_schedulers_elect_a_single_leader(database: Database) -> None:
    # CA-2: the advisory lock elects one instance; the idle one retries and stays standby.
    # The clock sits outside both tick windows, so the leader proves the election without
    # writing the shared outbox that the scheduler suites read (test isolation).
    test_deps = Deps(
        db=database,
        clock=FakeClock(parse_iso("2026-11-11T00:00:00Z")),
        logger=RecordingLogger(),
    )
    first = Scheduler(test_deps, retry_interval_s=0.1, poll_interval_s=0.1)
    second = Scheduler(test_deps, retry_interval_s=0.1, poll_interval_s=0.1)
    stop = asyncio.Event()
    tasks = [
        asyncio.create_task(first.run(stop), name="first"),
        asyncio.create_task(second.run(stop), name="second"),
    ]
    try:
        for _ in range(100):
            if first.is_leader != second.is_leader:
                break
            await asyncio.sleep(0.02)
        assert first.is_leader != second.is_leader, "exactly one scheduler must be the leader"
    finally:
        stop.set()
        await asyncio.gather(*tasks, return_exceptions=True)
    assert first.is_leader is False
    assert second.is_leader is False


async def test_a_claimed_delivery_marks_its_lease(database: Database) -> None:
    # The claim statement is the only writer of the lease; a foreign claim sees the same row only
    # after expiry, which is what makes CL-1 and CL-2 hold.
    counter = Counter()
    dispatcher = Dispatcher(deps(database), consumers=(consumer(counter),))
    event_id = f"spec-2102:{uuid.uuid4()}"
    try:
        async with database.service_tx() as tx:
            await tx.emit(DEMO_EVENT, {"runId": str(uuid.uuid4()), "failOnceAt": "none"}, event_id=event_id)
        await dispatcher.dispatch_once()
        async with database.service_tx() as tx:
            first = await outbox.claim(tx, now=FIXED, lease_seconds=30, free_slots=1)
            second = await outbox.claim(tx, now=FIXED, lease_seconds=30, free_slots=1)
        assert len(first) == 1
        assert second == []
    finally:
        async with database.service_tx() as tx:
            await tx.conn.execute(
                text("delete from public.event_outbox where event_id = :id"), {"id": event_id}
            )


async def test_the_tables_refuse_a_client_insert(database: Database) -> None:
    # The worker tables are service-only: an authenticated caller cannot write a delivery.
    from factories.db_support import as_user
    from learny.identity.domain.actor import Actor

    actor = Actor(user_id=str(uuid.uuid4()), email="", email_confirmed=True, transport="bearer")

    async def forged(inner: Any) -> None:
        await inner.conn.execute(
            text(
                "insert into public.job_deliveries (event_id, consumer, run_after)"
                " values ('forged', 'devtools.demo_job', now())"
            )
        )

    del actor
    with pytest.raises(Exception) as caught:  # noqa: PT011 - the SQLSTATE is the assertion
        async with database.service_tx() as tx:
            await as_user(tx, str(uuid.uuid4()), forged)
    assert failure_code(caught.value) in ("42501", "23503")
