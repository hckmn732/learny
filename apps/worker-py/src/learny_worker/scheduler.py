"""Singleton scheduler of the periodic tasks (SPEC-2102 step 5, SPEC-2207, ADR-0067).

One dedicated connection holds `pg_try_advisory_lock(<constant>)`; every other instance stays idle
and retries every 15 s (CL-2). Two schedules only, hard-coded: hourly at minute 5 and nightly at
01:30, both UTC.

- hourly: expires the pending automation actions whose instant has passed (SPEC-711 ET-4), emits one
  `user/local-tick` per active learner (pages of 500, the exact payload of the TypeScript cron) and
  then `cron/hourly-tick` (`{tickAt}`);
- nightly: emits `cron/nightly` (`{runDate}`), which fans out to the six nightly treatments.

The outbox resend of the TypeScript tick is not ported: the dispatcher polls. Both tasks are served
by Python (SPEC-2302); the event identifiers (`hourly-tick:<T>`, `nightly:<runDate>`,
`local-tick:<user>:<windowStart>`) make a replay harmless.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from learny.engagement.domain.tick import TICK_PAGE_SIZE
from learny.engagement.public import (
    LOCAL_TICK_EVENT,
    expire_due_automation_actions,
    local_tick_event_id,
    local_tick_page,
)
from sqlalchemy import text

SCHEDULER_LOCK_KEY = 2102_0001
HOURLY_MINUTE = 5
NIGHTLY_HOUR = 1
NIGHTLY_MINUTE = 30
DEFAULT_RETRY_INTERVAL_S = 15
TICK_POLL_INTERVAL_S = 20

ACQUIRE_LOCK = text("select pg_try_advisory_lock(:key) as locked")
RELEASE_LOCK = text("select pg_advisory_unlock(:key) as released")

CRON_HOURLY = "cron/hourly-tick"
CRON_NIGHTLY = "cron/nightly"


def hourly_tick_instant(now: datetime) -> datetime:
    """`T` truncated to the minute, as the TypeScript cron does."""
    return now.astimezone(UTC).replace(second=0, microsecond=0)


def hourly_payload(now: datetime) -> tuple[str, dict[str, str]]:
    """`hourly-tick:<T>` and `{tickAt}`: the exact payload of `cron-hourly-tick.ts`."""
    tick_at = hourly_tick_instant(now)
    return f"hourly-tick:{_iso(tick_at)}", {"tickAt": _iso(tick_at)}


def nightly_payload(now: datetime) -> tuple[str, dict[str, str]]:
    """`nightly:<runDate>` and `{runDate}`: the exact payload of `cron-nightly.ts`."""
    run_date = now.astimezone(UTC).date().isoformat()
    return f"nightly:{run_date}", {"runDate": run_date}


def due_ticks(
    now: datetime,
    last: dict[str, datetime] | None = None,
) -> list[tuple[str, str, dict[str, str]]]:
    """The ticks due at `now`: `(name, event id, data)`, at most once per period.

    `last` holds the period already emitted (the start of the hour, the start of the day), so a
    replay of the scheduler in the same period emits nothing twice.
    """
    seen = last or {}
    instant = now.astimezone(UTC)
    due: list[tuple[str, str, dict[str, str]]] = []
    hourly_period = instant.replace(minute=0, second=0, microsecond=0)
    if instant.minute >= HOURLY_MINUTE and seen.get(CRON_HOURLY) != hourly_period:
        event_id, data = hourly_payload(instant)
        due.append((CRON_HOURLY, event_id, data))
    nightly_period = instant.replace(hour=0, minute=0, second=0, microsecond=0)
    after_nightly = (instant.hour, instant.minute) >= (NIGHTLY_HOUR, NIGHTLY_MINUTE)
    if after_nightly and seen.get(CRON_NIGHTLY) != nightly_period:
        event_id, data = nightly_payload(instant)
        due.append((CRON_NIGHTLY, event_id, data))
    return due


def period_of(name: str, now: datetime) -> datetime:
    """The period an emitted tick covers: the start of its hour, or of its day."""
    instant = now.astimezone(UTC)
    if name == CRON_HOURLY:
        return instant.replace(minute=0, second=0, microsecond=0)
    return instant.replace(hour=0, minute=0, second=0, microsecond=0)


class Scheduler:
    """Leader-only scheduler: acquires the advisory lock once and runs the due tasks."""

    def __init__(
        self,
        deps: Any,
        *,
        retry_interval_s: float = DEFAULT_RETRY_INTERVAL_S,
        poll_interval_s: float = TICK_POLL_INTERVAL_S,
        logger: Any = None,
    ) -> None:
        self._deps = deps
        self._retry_interval = retry_interval_s
        self._poll_interval = poll_interval_s
        self._logger = logger or structlog.get_logger("learny.worker.scheduler")
        self._last: dict[str, datetime] = {}
        self.is_leader = False

    async def emit_due(self) -> list[str]:
        """Runs the tasks that are due; returns their event identifiers."""
        emitted: list[str] = []
        now = self._deps.clock.now()
        for name, event_id, data in due_ticks(now, self._last):
            if name == CRON_HOURLY:
                await self.hourly_task(now)
            else:
                await self._emit(name, event_id, data)
            self._last[name] = period_of(name, now)
            emitted.append(event_id)
            self._logger.info("cron emitted", eventName=name, eventId=event_id)
        return emitted

    async def hourly_task(self, now: datetime) -> int:
        """`cron-hourly-tick`: expire, fan the local ticks out, then emit the tick itself.

        Returns how many learners received a local tick. The order is the one of the TypeScript
        cron; the actions expire on the same injected instant as the rest of the run.
        """
        instant = hourly_tick_instant(now)
        expired = await expire_due_automation_actions(self._deps)
        users = await self.emit_local_ticks(instant)
        event_id, data = hourly_payload(now)
        await self._emit(CRON_HOURLY, event_id, data)
        self._logger.info(
            "hourly task completed",
            tickAt=_iso(instant),
            outcome=f"expired={expired} localTicks={users}",
        )
        return users

    async def emit_local_ticks(self, tick: datetime) -> int:
        """Emits `user/local-tick` per active learner, page of 500 identifiers at a time."""
        emitted = 0
        after: str | None = None
        while True:
            page = await local_tick_page(self._deps, tick, after)
            events: list[dict[str, Any]] = page["events"]
            if events:
                async with self._deps.db.service_tx() as tx:
                    for payload in events:
                        await tx.emit(
                            LOCAL_TICK_EVENT,
                            payload,
                            event_id=local_tick_event_id(payload),
                        )
                emitted += len(events)
            if page["size"] < TICK_PAGE_SIZE or page["after"] is None:
                return emitted
            after = str(page["after"])

    async def _emit(self, name: str, event_id: str, data: dict[str, str]) -> None:
        async with self._deps.db.service_tx() as tx:
            await tx.emit(name, data, event_id=event_id)

    async def run(self, stop: asyncio.Event) -> None:
        """Acquires the lock, then loops until `stop`; a non-leader retries every 15 s."""
        engine = getattr(self._deps.db, "engine", None)
        if engine is None:
            raise RuntimeError("the scheduler needs a Database exposing its engine")
        while not stop.is_set():
            async with engine.connect() as connection:
                locked = bool((await connection.execute(ACQUIRE_LOCK, {"key": SCHEDULER_LOCK_KEY})).scalar())
                if not locked:
                    self.is_leader = False
                    self._logger.info("scheduler standby", retryAfterSeconds=self._retry_interval)
                    await _wait(stop, self._retry_interval)
                    continue
                self.is_leader = True
                self._logger.info("scheduler leader")
                try:
                    while not stop.is_set():
                        try:
                            await self.emit_due()
                        except Exception as error:
                            self._logger.error(
                                "cron emission failed",
                                code=type(error).__name__,
                                error=str(error)[:200],
                            )
                        await _wait(stop, self._poll_interval)
                finally:
                    await connection.execute(RELEASE_LOCK, {"key": SCHEDULER_LOCK_KEY})
                    self.is_leader = False


async def _wait(stop: asyncio.Event, seconds: float) -> None:
    try:
        await asyncio.wait_for(stop.wait(), timeout=seconds)
    except TimeoutError:
        return


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def next_tick(now: datetime) -> datetime:
    """Next hour boundary at minute 5, used by the tests to jump forward."""
    instant = now.astimezone(UTC)
    candidate = instant.replace(minute=HOURLY_MINUTE, second=0, microsecond=0)
    if candidate <= instant:
        candidate = (instant + timedelta(hours=1)).replace(minute=HOURLY_MINUTE, second=0, microsecond=0)
    return candidate
