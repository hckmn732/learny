"""[SPEC-2102] Consumer registry: ownership filtering, payload validation, subscriptions."""

import re
from dataclasses import dataclass, field
from datetime import datetime

import pytest
from learny.shared.clock import Clock
from learny.shared.outbox.errors import PermanentJobError
from learny.shared.outbox.events import Event
from learny.shared.ownership import Owner
from learny.shared.time import parse_iso
from learny_worker.consumers import (
    CONSUMERS,
    DEMO_CONSUMER,
    DEMO_EVENT,
    Consumer,
    active_consumers,
    demo_job,
    subscribed,
    validate_demo_event,
)
from support.fakes import FakeClock, FakeDatabase, FakeDeps, RecordingConnection, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2102")

NAME = re.compile(r"^[a-z]+(\.[a-z0-9_]+)+$")
FIXED = parse_iso("2026-11-11T12:20:00Z")


@dataclass
class FakeOwnership:
    consumers: dict[str, Owner] = field(default_factory=dict)
    crons: dict[str, Owner] = field(default_factory=dict)


def event(data: dict[str, object] | None = None, name: str = DEMO_EVENT) -> Event:
    return Event(
        event_id="sdd-demo:11111111-1111-4111-8111-111111111111",
        name=name,
        data={"runId": "11111111-1111-4111-8111-111111111111", "failOnceAt": "none"}
        if data is None
        else data,
        user_id=None,
        created_at=FIXED,
    )


def test_the_registry_declares_valid_names_and_events() -> None:
    assert CONSUMERS
    for consumer in CONSUMERS:
        assert NAME.match(consumer.name), consumer.name
        assert "/" in consumer.on
        assert consumer.max_attempts >= 1
        assert consumer.timeout_s > 0


def test_the_demo_consumer_is_declared() -> None:
    demo = next(consumer for consumer in CONSUMERS if consumer.name == DEMO_CONSUMER)
    assert demo.on == DEMO_EVENT
    assert demo.validate is validate_demo_event


def test_a_python_owned_consumer_is_active() -> None:
    ownership = FakeOwnership(consumers={DEMO_CONSUMER: "py"})
    assert [consumer.name for consumer in active_consumers(ownership)] == [DEMO_CONSUMER]


def test_a_typescript_owned_consumer_is_never_active() -> None:
    # CA-3: an event owned by Inngest is never consumed by the Python worker.
    ownership = FakeOwnership(consumers={DEMO_CONSUMER: "ts"})
    assert active_consumers(ownership) == ()


def test_an_undeclared_consumer_is_not_active() -> None:
    assert active_consumers(FakeOwnership()) == ()


def test_subscriptions_are_filtered_by_event_name() -> None:
    consumers = (
        Consumer("devtools.a_b", on="one/event", run=demo_job),
        Consumer("devtools.c_d", on="two/event", run=demo_job),
    )
    assert [consumer.name for consumer in subscribed(consumers, "one/event")] == ["devtools.a_b"]
    assert subscribed(consumers, "three/event") == ()


def test_validates_the_demo_payload() -> None:
    validate_demo_event(event())


@pytest.mark.parametrize(
    "data",
    [
        {},
        {"runId": "short", "failOnceAt": "none"},
        {"runId": "11111111-1111-4111-8111-111111111111", "failOnceAt": "step-3"},
        {"runId": 42, "failOnceAt": "none"},
    ],
)
def test_refuses_an_invalid_demo_payload(data: dict[str, object]) -> None:
    with pytest.raises(PermanentJobError, match="VALIDATION_FAILED"):
        validate_demo_event(event(data))


async def test_the_demo_consumer_records_the_three_steps() -> None:
    logger = RecordingLogger()
    database = FakeDatabase()
    deps = FakeDeps(db=database, clock=FakeClock(FIXED), logger=logger)
    await demo_job(deps, event())
    # The pipeline wrote the row, its three steps, the attempt counter and the closing instant.
    statements = database.conn.statements()
    assert statements[0].startswith("insert into public.sdd_demo_runs")

    def updates(prefix: str) -> list[str]:
        return [statement for statement in statements if statement.startswith(prefix)]

    assert len(updates("update public.sdd_demo_runs set steps")) == 3
    assert len(updates("update public.sdd_demo_runs set attempts")) == 1
    assert len(updates("update public.sdd_demo_runs set finished_at")) == 1
    assert logger.messages()[-1] == "demo job consumed"
    assert logger.lines[-1][1]["runId"] == "11111111-1111-4111-8111-111111111111"
    assert logger.lines[-1][1]["attempts"] == 1


async def test_the_demo_switch_fails_the_second_step_once() -> None:
    logger = RecordingLogger()
    database = FakeDatabase()
    deps = FakeDeps(db=database, clock=FakeClock(FIXED), logger=logger)
    await demo_job(deps, event({"runId": "11111111-1111-4111-8111-111111111111", "failOnceAt": "step-2"}))
    assert "demo step failed once" in logger.messages()
    assert logger.lines[-1][1]["attempts"] == 2
    increments = [
        parameters["attempts"]
        for statement, parameters in database.conn.calls
        if statement.startswith("update public.sdd_demo_runs set attempts")
    ]
    assert increments == [1, 2]


async def test_a_finished_demo_run_is_left_untouched() -> None:
    logger = RecordingLogger()
    database = FakeDatabase()
    finished = {"name": "step-1-prepare", "at": "2026-11-11T12:20:00.000Z"}
    database.conn = RecordingConnection([[], [{"attempts": 2, "steps": [finished], "finished_at": FIXED}]])
    deps = FakeDeps(db=database, clock=FakeClock(FIXED), logger=logger)
    await demo_job(deps, event())
    assert [statement for statement in database.conn.statements() if statement.startswith("update")] == []
    assert logger.lines[-1][1]["skipped"] is True


def test_a_delayed_consumer_exposes_its_first_run() -> None:
    def run_at(_event: Event, _clock: Clock) -> datetime | None:
        return FIXED

    consumer = Consumer("devtools.a_b", on="one/event", run=demo_job, run_at=run_at)
    assert consumer.run_after(event(), FakeClock(FIXED)) == FIXED
    assert Consumer("devtools.a_b", on="one/event", run=demo_job).run_after(event(), FakeClock(FIXED)) is None
