"""Local windows of the hourly tick (SPEC-2205).

The tick at `T` covers `[T - 5 min, T + 55 min[`: a local clock time such as `08:00` falls in at
most one window, so two consecutive ticks never both return it (ADR-0123). A non-existent local time
(spring forward) resolves to the first valid minute after the gap, an ambiguous one (fall back) to
its first occurrence only.
"""

from dataclasses import dataclass
from datetime import datetime

from learny.shared.time import (
    MS_PER_MINUTE,
    from_epoch_ms,
    local_time_to_instant,
    to_epoch_ms,
    user_local_day,
    user_weekday,
)

TICK_PAGE_SIZE = 500
WINDOW_BEFORE_MS = 5 * MS_PER_MINUTE
WINDOW_AFTER_MS = 55 * MS_PER_MINUTE
ACTIVE_ONBOARDING_STEPS = ("rappels", "depart", "done")


@dataclass(frozen=True, slots=True)
class LocalTick:
    """The window of one learner for one tick, with its local civil day and weekday."""

    user_id: str
    timezone: str
    window_start: datetime
    window_end: datetime
    local_date: str
    local_weekday: int


def tick_instant(now: datetime) -> datetime:
    """`tickInstant`: the instant of the tick, truncated to the minute."""
    milliseconds = to_epoch_ms(now)
    return from_epoch_ms((milliseconds // MS_PER_MINUTE) * MS_PER_MINUTE)


def build_local_tick(user_id: str, timezone: str, tick: datetime) -> LocalTick | None:
    """`buildLocalTick`: the window of `tick`, or `None` when the stored zone is not usable."""
    tick_ms = to_epoch_ms(tick)
    start_ms = tick_ms - WINDOW_BEFORE_MS
    end_ms = tick_ms + WINDOW_AFTER_MS
    try:
        local_date = user_local_day(start_ms, timezone)
        weekday = user_weekday(start_ms, timezone)
    except (KeyError, ValueError):
        return None
    return LocalTick(
        user_id=user_id,
        timezone=timezone,
        window_start=from_epoch_ms(start_ms),
        window_end=from_epoch_ms(end_ms),
        local_date=local_date,
        local_weekday=weekday,
    )


def due_in_window(hhmm: str, window: LocalTick) -> datetime | None:
    """`dueInWindow`: the instant at which `hhmm` happens inside the window, or `None`."""
    start = to_epoch_ms(window.window_start)
    end = to_epoch_ms(window.window_end)
    if end <= start:
        return None
    dates = (user_local_day(start, window.timezone), user_local_day(end - 1, window.timezone))
    instants = [
        instant
        for instant in (local_time_to_instant(date, hhmm, window.timezone) for date in dates)
        if start <= instant < end
    ]
    if not instants:
        return None
    return from_epoch_ms(min(instants))


def digest_time_of(value: str) -> str:
    """`settings.digestTime.slice(0, 5)`: the `HH:mm` reading of a stored time."""
    return value[0:5]


def window_of_instant(tick: datetime) -> tuple[datetime, datetime]:
    """The bounds of the window of `tick`, in UTC."""
    tick_ms = to_epoch_ms(tick)
    return (
        from_epoch_ms(tick_ms - WINDOW_BEFORE_MS),
        from_epoch_ms(tick_ms + WINDOW_AFTER_MS),
    )


__all__ = [
    "ACTIVE_ONBOARDING_STEPS",
    "TICK_PAGE_SIZE",
    "WINDOW_AFTER_MS",
    "WINDOW_BEFORE_MS",
    "LocalTick",
    "build_local_tick",
    "digest_time_of",
    "due_in_window",
    "tick_instant",
    "window_of_instant",
]
