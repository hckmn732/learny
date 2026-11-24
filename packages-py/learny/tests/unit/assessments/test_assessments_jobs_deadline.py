"""`run_at` of the exam deadline (SPEC-2207).

The consumer runs at `deadlineAt + 5 s`; a deadline already passed runs immediately, so a late
delivery never waits for a scheduled instant in the past.
"""

from datetime import timedelta

import pytest
from learny.assessments.application.exam_deadline import (
    EXAM_DEADLINE_GRACE_MS,
    deadline_reached,
    run_at,
    submit_at_of,
)
from learny.shared.outbox.events import Event
from learny.shared.time import parse_iso, to_iso

pytestmark = pytest.mark.spec("SPEC-2207")

NOW = parse_iso("2026-11-11T12:20:00Z")


class FrozenClock:
    """The smallest clock the helper reads."""

    def now(self) -> object:
        return NOW


def event_of(deadline_at: str) -> Event:
    return Event(
        event_id="exam-started:1",
        name="exam/started",
        data={"userId": "00000000-0000-4000-8000-000000000001", "deadlineAt": deadline_at},
        user_id=None,
        created_at=NOW,
    )


def test_the_run_instant_is_the_deadline_plus_five_seconds() -> None:
    assert EXAM_DEADLINE_GRACE_MS == 5_000
    deadline = "2026-11-11T13:00:00.000Z"
    assert submit_at_of(deadline) == parse_iso("2026-11-11T13:00:05.000Z")
    assert submit_at_of(parse_iso(deadline)) == parse_iso("2026-11-11T13:00:05.000Z")
    assert submit_at_of(deadline) - parse_iso(deadline) == timedelta(seconds=5)


def test_a_future_deadline_is_scheduled_after_the_grace() -> None:
    scheduled = run_at(event_of("2026-11-11T13:00:00.000Z"), FrozenClock())
    assert scheduled is not None
    assert to_iso(scheduled) == "2026-11-11T13:00:05.000Z"


def test_a_passed_deadline_runs_immediately() -> None:
    scheduled = run_at(event_of("2026-11-11T09:00:00.000Z"), FrozenClock())
    assert scheduled == NOW


def test_an_event_without_deadline_has_no_schedule() -> None:
    missing = Event(event_id="exam-started:2", name="exam/started", data={}, user_id=None, created_at=NOW)
    assert run_at(missing, FrozenClock()) is None


def test_the_service_gate_is_the_five_second_tolerance() -> None:
    deadline = parse_iso("2026-11-11T12:19:59.000Z")
    assert deadline_reached(deadline, parse_iso("2026-11-11T12:20:03.000Z")) is False
    assert deadline_reached(deadline, parse_iso("2026-11-11T12:20:04.500Z")) is True
