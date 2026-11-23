"""[SPEC-2207] The two tasks of the scheduler: hourly fan-out and nightly tick (CA-1, CL-2)."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import pytest
from learny.shared.ownership import Owner
from learny_worker.scheduler import (
    CRON_HOURLY,
    CRON_NIGHTLY,
    Scheduler,
    hourly_tick_instant,
)
from support.fakes import FakeClock, FakeDatabase, FakeDeps, RecordingConnection, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2207")

USER = "0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01"
USER_2 = "3f1c8a5e-5d0e-4a0b-9a6e-7b2c4d9e1f02"


@dataclass
class FakeOwnership:
    crons: dict[str, Owner] = field(default_factory=dict)
    consumers: dict[str, Owner] = field(default_factory=dict)


def at(hour: int, minute: int, second: int = 0) -> datetime:
    return datetime(2026, 11, 11, hour, minute, second, tzinfo=UTC)


def learner(user_id: str, timezone: str = "Europe/Paris") -> dict[str, Any]:
    return {"user_id": user_id, "timezone": timezone}


def build(
    *outcomes: Any,
    crons: dict[str, Owner] | None = None,
    now: datetime | None = None,
) -> tuple[Scheduler, FakeDatabase, RecordingLogger]:
    database = FakeDatabase()
    if outcomes:
        database.conn = RecordingConnection(list(outcomes))
    logger = RecordingLogger()
    deps = FakeDeps(db=database, clock=FakeClock(now or at(5, 5)), logger=logger)
    owned: dict[str, Owner] = {CRON_HOURLY: "py", CRON_NIGHTLY: "py"} if crons is None else crons
    return Scheduler(deps, FakeOwnership(crons=owned), logger=logger), database, logger


def emitted(database: FakeDatabase) -> list[tuple[str, dict[str, Any]]]:
    return [(name, dict(data)) for name, data, _user in database.emitted]


def tick_identifiers(database: FakeDatabase) -> list[str]:
    return [
        statement.removeprefix("emit ")
        for statement, _ in database.conn.calls
        if statement.startswith("emit ")
    ]


async def test_the_hourly_task_expires_fans_out_and_emits_the_tick() -> None:
    scheduler, database, logger = build([], [learner(USER), learner(USER_2)])
    users = await scheduler.hourly_task(at(5, 5))

    assert users == 2
    names = [name for name, _ in emitted(database)]
    assert names == ["user/local-tick", "user/local-tick", CRON_HOURLY]
    assert emitted(database)[-1][1] == {"tickAt": "2026-11-11T05:05:00.000Z"}
    assert "hourly task completed" in logger.messages()


async def test_the_local_tick_payload_is_the_typescript_one() -> None:
    scheduler, database, _ = build([], [learner(USER)])
    await scheduler.hourly_task(at(5, 5))

    name, payload = emitted(database)[0]
    assert name == "user/local-tick"
    assert payload == {
        "userId": USER,
        "timezone": "Europe/Paris",
        "windowStart": "2026-11-11T05:00:00.000Z",
        "windowEnd": "2026-11-11T06:00:00.000Z",
        "localDate": "2026-11-11",
        "localWeekday": 3,
    }


async def test_the_local_tick_identifier_covers_the_user_and_the_window() -> None:
    scheduler, database, _ = build([], [learner(USER)])
    await scheduler.hourly_task(at(5, 5))

    assert tick_identifiers(database) == [
        f"local-tick:{USER}:2026-11-11T05:00:00.000Z",
        "hourly-tick:2026-11-11T05:05:00.000Z",
    ]


async def test_the_fan_out_pages_through_the_active_learners() -> None:
    first_page = [learner(f"0b6f2a7e-9a3c-4c1c-8a55-{index:012d}") for index in range(500)]
    second_page = [learner(USER_2)]
    scheduler, database, _ = build([], first_page, second_page)

    users = await scheduler.hourly_task(at(5, 5))

    assert users == 501
    selects = [statement for statement in database.conn.statements() if "profiles" in statement]
    assert len(selects) == 2
    assert emitted(database)[-1][0] == CRON_HOURLY


async def test_the_hourly_task_emits_the_tick_without_any_learner() -> None:
    scheduler, database, _ = build([], [])
    assert await scheduler.hourly_task(at(5, 5)) == 0
    assert emitted(database) == [(CRON_HOURLY, {"tickAt": "2026-11-11T05:05:00.000Z"})]


async def test_the_nightly_task_emits_only_the_nightly_tick() -> None:
    scheduler, database, _ = build(crons={CRON_NIGHTLY: "py"}, now=at(1, 30))
    emitted_ids = await scheduler.emit_due()

    assert emitted_ids == ["nightly:2026-11-11"]
    assert emitted(database) == [(CRON_NIGHTLY, {"runDate": "2026-11-11"})]


async def test_the_hourly_task_runs_on_the_truncated_instant() -> None:
    scheduler, database, _ = build([], [])
    await scheduler.hourly_task(at(5, 5, 42))

    assert hourly_tick_instant(at(5, 5, 42)) == at(5, 5)
    assert emitted(database) == [(CRON_HOURLY, {"tickAt": "2026-11-11T05:05:00.000Z"})]


async def test_a_replayed_period_emits_nothing_twice() -> None:
    scheduler, database, _ = build([], [learner(USER)])
    assert len(await scheduler.emit_due()) == 2

    # The same instant again: the period is already covered, so nothing is emitted.
    assert await scheduler.emit_due() == []
    assert len([name for name, _ in emitted(database) if name == CRON_HOURLY]) == 1


async def test_an_idle_scheduler_neither_expires_nor_emits() -> None:
    scheduler, database, _ = build(crons={CRON_HOURLY: "ts", CRON_NIGHTLY: "ts"})
    assert await scheduler.emit_due() == []
    assert database.conn.statements() == []
    assert emitted(database) == []


async def test_an_invalid_time_zone_is_skipped_without_failing_the_tick() -> None:
    scheduler, database, logger = build([], [learner(USER, "Not/AZone")])
    assert await scheduler.hourly_task(at(5, 5)) == 0
    assert emitted(database) == [(CRON_HOURLY, {"tickAt": "2026-11-11T05:05:00.000Z"})]
    assert "local tick skipped: invalid time zone" in logger.messages()
