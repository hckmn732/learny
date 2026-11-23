"""[SPEC-2102] Scheduler: schedules, payloads, idempotence and ownership (CA-2, CA-3)."""

from dataclasses import dataclass, field
from datetime import UTC, datetime

import pytest
from learny.shared.ownership import Owner
from learny_worker.scheduler import (
    CRON_HOURLY,
    CRON_NIGHTLY,
    Scheduler,
    due_ticks,
    hourly_payload,
    next_tick,
    nightly_payload,
)
from support.fakes import FakeClock, FakeDatabase, FakeDeps, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2102")


@dataclass
class FakeOwnership:
    crons: dict[str, Owner] = field(default_factory=dict)
    consumers: dict[str, Owner] = field(default_factory=dict)


def at(hour: int, minute: int, second: int = 0) -> datetime:
    return datetime(2026, 11, 11, hour, minute, second, tzinfo=UTC)


def scheduler(owner: Owner | None = None) -> tuple[Scheduler, FakeDatabase, RecordingLogger]:
    database = FakeDatabase()
    logger = RecordingLogger()
    deps = FakeDeps(db=database, clock=FakeClock(at(5, 5)), logger=logger)
    crons: dict[str, Owner] = {} if owner is None else {CRON_HOURLY: owner, CRON_NIGHTLY: owner}
    return Scheduler(deps, FakeOwnership(crons=crons), logger=logger), database, logger


def test_the_hourly_tick_is_not_due_before_minute_five() -> None:
    # The nightly tick is still due at 04:02; the hourly one is not.
    names = [name for name, _, _ in due_ticks(at(4, 2))]
    assert CRON_HOURLY not in names
    assert CRON_NIGHTLY in names


def test_the_hourly_tick_is_due_at_minute_five() -> None:
    due = due_ticks(at(5, 5))
    names = [name for name, _, _ in due]
    assert CRON_HOURLY in names
    event_id, data = hourly_payload(at(5, 5))
    assert event_id == "hourly-tick:2026-11-11T05:05:00.000Z"
    assert data == {"tickAt": "2026-11-11T05:05:00.000Z"}


def test_the_hourly_payload_is_truncated_to_the_minute() -> None:
    event_id, data = hourly_payload(at(7, 5, 42))
    assert event_id == "hourly-tick:2026-11-11T07:05:00.000Z"
    assert data["tickAt"].endswith("07:05:00.000Z")


def test_the_nightly_tick_is_due_at_one_thirty() -> None:
    assert CRON_NIGHTLY not in [name for name, _, _ in due_ticks(at(1, 29))]
    assert CRON_NIGHTLY in [name for name, _, _ in due_ticks(at(1, 30))]
    event_id, data = nightly_payload(at(1, 30))
    assert event_id == "nightly:2026-11-11"
    assert data == {"runDate": "2026-11-11"}


def test_a_period_is_emitted_once() -> None:
    now = at(5, 5)
    first = due_ticks(now)
    periodic = {
        CRON_HOURLY: now.replace(minute=0),
        CRON_NIGHTLY: now.replace(hour=0, minute=0),
    }
    assert first
    assert due_ticks(at(5, 6), periodic) == []


def test_next_tick_moves_to_the_next_hour() -> None:
    assert next_tick(at(5, 5)) == at(6, 5)
    assert next_tick(at(5, 4)) == at(5, 5)


def test_the_scheduler_stays_idle_while_the_crons_are_typescript() -> None:
    idle, _, _ = scheduler()
    assert idle.owns(CRON_HOURLY) is False
    assert idle.owns(CRON_NIGHTLY) is False


async def test_an_idle_scheduler_emits_nothing() -> None:
    idle, database, _ = scheduler()
    assert await idle.emit_due() == []
    assert database.emitted == []


async def test_a_python_owned_cron_is_emitted_once() -> None:
    owned, database, logger = scheduler(owner="py")
    emitted = await owned.emit_due()
    assert len(emitted) == 2
    assert [entry[0] for entry in database.emitted] == [CRON_HOURLY, CRON_NIGHTLY]
    assert emitted == ["hourly-tick:2026-11-11T05:05:00.000Z", "nightly:2026-11-11"]
    assert "cron emitted" in logger.messages()
    # The next tick in the same period emits nothing: the event identifier is the guard.
    assert await owned.emit_due() == []
