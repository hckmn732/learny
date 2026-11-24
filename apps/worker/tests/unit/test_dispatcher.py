"""[SPEC-2102] Dispatcher: fan-out, delayed runs, rejected payloads."""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

import pytest
from learny.shared.clock import Clock
from learny.shared.outbox.events import Event
from learny.shared.time import parse_iso
from learny_worker.consumers import Consumer, demo_job, validate_demo_event
from learny_worker.dispatcher import Dispatcher
from support.fakes import FakeClock, FakeDatabase, FakeDeps, RecordingConnection, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2102")

FIXED = parse_iso("2026-11-11T12:20:00Z")
RUN_ID = "11111111-1111-4111-8111-111111111111"


EVENT = Event(
    event_id="sdd-demo:1",
    name="sdd/demo-requested",
    data={"runId": RUN_ID, "failOnceAt": "none"},
    user_id=None,
    created_at=FIXED,
)


def row(event: Event = EVENT) -> dict[str, object]:
    return {
        "event_id": event.event_id,
        "name": event.name,
        "data": dict(event.data),
        "user_id": event.user_id,
        "created_at": event.created_at,
    }


def dispatcher(
    *events: Event,
    registry: tuple[Consumer, ...] | None = None,
) -> tuple[Dispatcher, FakeDatabase, RecordingLogger]:
    database = FakeDatabase()
    database.conn = RecordingConnection([[row(event) for event in events]])
    logger = RecordingLogger()
    deps = FakeDeps(db=database, clock=FakeClock(FIXED), logger=logger)
    consumers = registry or (
        Consumer(
            "devtools.demo_job",
            on="sdd/demo-requested",
            run=demo_job,
            validate=validate_demo_event,
        ),
    )
    return (
        Dispatcher(deps, consumers=consumers, logger=logger),
        database,
        logger,
    )


def deliveries(database: FakeDatabase) -> list[Mapping[str, Any]]:
    return [
        parameters
        for statement, parameters in database.conn.calls
        if "insert into public.job_deliveries" in statement
    ]


async def test_fans_out_one_delivery_per_python_consumer() -> None:
    dispatcher_under_test, database, _ = dispatcher(EVENT)
    assert await dispatcher_under_test.dispatch_once() == 1
    scheduled = deliveries(database)
    assert len(scheduled) == 1
    assert scheduled[0]["consumer"] == "devtools.demo_job"
    assert scheduled[0]["run_after"] == FIXED


async def test_nothing_undispatched_creates_nothing() -> None:
    dispatcher_under_test, database, _ = dispatcher()
    assert await dispatcher_under_test.dispatch_once() == 0
    assert deliveries(database) == []


async def test_each_event_gets_its_own_delivery() -> None:
    second = Event(
        event_id="sdd-demo:2", name=EVENT.name, data=dict(EVENT.data), user_id=None, created_at=FIXED
    )
    dispatcher_under_test, database, _ = dispatcher(EVENT, second)
    assert await dispatcher_under_test.dispatch_once() == 2
    assert [entry["event_id"] for entry in deliveries(database)] == ["sdd-demo:1", "sdd-demo:2"]


async def test_an_invalid_payload_becomes_a_failed_delivery() -> None:
    invalid = Event(
        event_id="sdd-demo:3",
        name=EVENT.name,
        data={"runId": "not-a-uuid", "failOnceAt": "none"},
        user_id=None,
        created_at=FIXED,
    )
    dispatcher_under_test, database, logger = dispatcher(invalid)
    assert await dispatcher_under_test.dispatch_once() == 1
    failed = [
        parameters
        for statement, parameters in database.conn.calls
        if "'failed'" in statement and "job_deliveries" in statement
    ]
    assert len(failed) == 1
    assert "VALIDATION_FAILED" in str(failed[0]["error"])
    assert "delivery rejected" in logger.messages()


async def test_a_delayed_consumer_schedules_its_first_run() -> None:
    later = parse_iso("2026-11-12T12:20:00Z")

    def run_at(_event: Event, _clock: Clock) -> datetime | None:
        return later

    consumer = Consumer("devtools.demo_job", on=EVENT.name, run=demo_job, run_at=run_at)
    dispatcher_under_test, database, _ = dispatcher(EVENT, registry=(consumer,))
    await dispatcher_under_test.dispatch_once()
    assert deliveries(database)[0]["run_after"] == later


async def test_a_database_error_is_logged_and_the_loop_survives() -> None:
    import asyncio

    database = FakeDatabase()
    database.conn = RecordingConnection([RuntimeError("connection lost")])
    logger = RecordingLogger()
    deps = FakeDeps(db=database, clock=FakeClock(FIXED), logger=logger)
    dispatcher_under_test = Dispatcher(deps, logger=logger)
    stop = asyncio.Event()

    async def stop_soon() -> None:
        await asyncio.sleep(0.02)
        stop.set()

    await asyncio.gather(dispatcher_under_test.run(stop), stop_soon())
    assert "dispatch failed" in logger.messages()
