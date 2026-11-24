"""[SPEC-2102] Runner: leases, backoff, retries, permanent failure and graceful stop."""

import asyncio
from dataclasses import dataclass, field

import pytest
from learny.shared.outbox.events import Delivery, Event
from learny.shared.time import parse_iso
from learny_worker.consumers import Consumer
from learny_worker.runner import LEASE_MARGIN_SECONDS, Runner
from support.fakes import FakeClock, FakeDatabase, FakeDeps, RecordingConnection, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2102")

FIXED = parse_iso("2026-11-11T12:20:00Z")
EVENT = Event(
    event_id="evt-1",
    name="sdd/demo-requested",
    data={"runId": "11111111-1111-4111-8111-111111111111", "failOnceAt": "none"},
    user_id=None,
    created_at=FIXED,
)


def claimed(attempts: int = 1, consumer: str = "devtools.demo_job") -> list[dict[str, object]]:
    return [
        {
            "event_id": EVENT.event_id,
            "consumer": consumer,
            "attempts": attempts,
            "name": EVENT.name,
            "data": EVENT.data,
            "user_id": None,
            "created_at": FIXED,
        }
    ]


@dataclass
class Counter:
    runs: int = 0
    errors: list[BaseException] = field(default_factory=list)
    delay: float = 0.0

    async def run(self, _deps: object, _event: Event) -> None:
        self.runs += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.errors:
            raise self.errors.pop(0)


def build(
    counter: Counter | None = None,
    *,
    max_attempts: int = 4,
    consumed: str = "devtools.demo_job",
) -> tuple[Runner, FakeDatabase, RecordingLogger]:
    runner_counter = counter or Counter()
    consumer = Consumer(
        name=consumed,
        on=EVENT.name,
        run=runner_counter.run,
        timeout_s=5,
        max_attempts=max_attempts,
    )
    database = FakeDatabase()
    logger = RecordingLogger()
    deps = FakeDeps(db=database, clock=FakeClock(FIXED), logger=logger)
    return Runner(deps, (consumer,), concurrency=1, logger=logger), database, logger


def statements(database: FakeDatabase) -> list[str]:
    return database.conn.statements()


def test_the_lease_outlives_the_consumer_timeout() -> None:
    runner, _, _ = build()
    consumer = Consumer("devtools.demo_job", on=EVENT.name, run=Counter().run, timeout_s=90)
    assert runner.lease_seconds(consumer) == 90 + LEASE_MARGIN_SECONDS


def test_backoff_is_bounded() -> None:
    from learny.shared.outbox.deliveries import backoff_seconds

    assert backoff_seconds(1) == 10
    assert backoff_seconds(2) == 20
    assert backoff_seconds(3) == 40
    assert backoff_seconds(10) == 3600
    assert backoff_seconds(99) == 3600


async def test_a_claimed_delivery_is_completed_once() -> None:
    counter = Counter()
    runner, database, logger = build(counter)
    database.conn = RecordingConnection([claimed()])
    assert await runner.run_once() == 1
    assert counter.runs == 1
    assert any("status = 'done'" in statement for statement in statements(database))
    assert logger.messages()[-1] == "delivery done"


async def test_nothing_due_claims_nothing() -> None:
    runner, database, _ = build()
    database.conn = RecordingConnection([])
    assert await runner.run_once() == 0
    assert database.conn.statements() == [str(database.conn.statements()[0])]


async def test_a_permanent_failure_is_not_retried() -> None:
    from learny.shared.outbox.errors import PermanentJobError

    counter = Counter(errors=[PermanentJobError("VALIDATION_FAILED", "bad payload")])
    runner, database, logger = build(counter)
    database.conn = RecordingConnection([claimed()])
    await runner.run_once()
    assert counter.runs == 1
    assert any("status = 'failed'" in statement for statement in statements(database))
    assert logger.messages()[-1] == "delivery failed"
    assert logger.lines[-1][1]["final"] is True


async def test_a_transient_failure_is_rescheduled_with_backoff() -> None:
    counter = Counter(errors=[RuntimeError("database hiccup")])
    runner, database, logger = build(counter)
    database.conn = RecordingConnection([claimed(attempts=2)])
    await runner.run_once()
    reschedule = [params for params in database.conn.parameters() if "run_after" in params]
    assert reschedule
    assert reschedule[0]["run_after"] == FIXED + __import__("datetime").timedelta(seconds=20)
    assert any("status = 'pending'" in statement for statement in statements(database))
    assert logger.messages()[-1] == "delivery failed, will retry"


async def test_the_last_attempt_fails_for_good() -> None:
    counter = Counter(errors=[RuntimeError("still broken")])
    runner, database, _ = build(counter, max_attempts=3)
    database.conn = RecordingConnection([claimed(attempts=3)])
    await runner.run_once()
    assert any("status = 'failed'" in statement for statement in statements(database))


async def test_an_unknown_consumer_fails_the_delivery() -> None:
    runner, database, logger = build()
    database.conn = RecordingConnection([claimed(consumer="devtools.unknown_job")])
    await runner.run_once()
    assert any("status = 'failed'" in statement for statement in statements(database))
    assert logger.lines[-1][1]["code"] == "UNKNOWN_CONSUMER"


async def test_a_consumer_that_times_out_is_retried() -> None:
    async def too_slow(_deps: object, _event: Event) -> None:
        await asyncio.sleep(5)

    consumer = Consumer("devtools.demo_job", on=EVENT.name, run=too_slow, timeout_s=0)
    database = FakeDatabase()
    logger = RecordingLogger()
    runner = Runner(
        FakeDeps(db=database, clock=FakeClock(FIXED), logger=logger),
        (consumer,),
        concurrency=1,
        logger=logger,
    )
    database.conn = RecordingConnection([claimed(attempts=1)])
    await runner.run_once()
    assert any("status = 'pending'" in statement for statement in statements(database))


async def test_the_stop_event_lets_the_batch_in_flight_finish() -> None:
    counter = Counter(delay=0.05)
    runner, database, _ = build(counter)
    database.conn = RecordingConnection([claimed(), [], []])
    stop = asyncio.Event()

    async def stop_soon() -> None:
        await asyncio.sleep(0.01)
        stop.set()

    await asyncio.gather(runner.run(stop), stop_soon())
    assert counter.runs == 1
    assert any("status = 'done'" in statement for statement in statements(database))


async def test_a_claim_error_does_not_kill_the_loop() -> None:
    runner, database, logger = build()
    database.conn = RecordingConnection([RuntimeError("connection lost"), []])
    stop = asyncio.Event()

    async def stop_soon() -> None:
        await asyncio.sleep(0.02)
        stop.set()

    await asyncio.gather(runner.run(stop), stop_soon())
    assert "claim failed" in logger.messages()


async def test_execute_runs_an_already_claimed_delivery() -> None:
    counter = Counter()
    runner, database, _ = build(counter)
    database.conn = RecordingConnection([[], []])
    await runner.execute(Delivery(event_id=EVENT.event_id, consumer="devtools.demo_job", attempts=1), EVENT)
    assert counter.runs == 1
    assert any("status = 'done'" in statement for statement in statements(database))
