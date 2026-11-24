"""Quiet hours of the learner (BR-NOT-04, SPEC-2205).

The range is `[start, end)` on the local clock and crosses midnight when `start > end`; an empty
range (`start == end`) means no quiet hours at all. The zone is always explicit and the instant is
always supplied by the caller, so nothing here reads the process clock (ADR-0047).
"""

from dataclasses import dataclass

from learny.shared.time import (
    MS_PER_MINUTE,
    add_civil_days,
    civil_day_ms,
    from_epoch_ms,
    instants_from_wall,
    local_minute_of_day,
    parse_time_of_day,
    user_local_day,
    wall_ms_of,
)

DEFAULT_QUIET_START = "21:00"
DEFAULT_QUIET_END = "08:00"


@dataclass(frozen=True, slots=True)
class QuietHours:
    """A quiet window, as the settings store it; `time_zone` is an IANA name."""

    time_zone: str
    start: str = DEFAULT_QUIET_START
    end: str = DEFAULT_QUIET_END

    @property
    def start_minutes(self) -> int:
        return parse_time_of_day(self.start, "start")

    @property
    def end_minutes(self) -> int:
        return parse_time_of_day(self.end, "end")


def is_quiet_at(instant_ms: int, quiet: QuietHours) -> bool:
    """Whether a local clock reading falls inside `[start, end)`, across midnight if needed."""
    start = quiet.start_minutes
    end = quiet.end_minutes
    if start == end:
        return False
    minutes = local_minute_of_day(instant_ms, quiet.time_zone)
    if start < end:
        return start <= minutes < end
    return minutes >= start or minutes < end


def is_quiet_hours(instant_ms: int, quiet: QuietHours) -> bool:
    """EF-5, BR-NOT-06: the start is included (21:00 is quiet), the end excluded (08:00 may send)."""
    return is_quiet_at(instant_ms, quiet)


def next_outside_quiet_hours(instant_ms: int, quiet: QuietHours) -> int:
    """EF-6: the instant itself when sending is allowed, else the first end of the range after it.

    A boundary skipped by the clock in spring is replaced by the jump instant; an autumn boundary
    read twice gives the first reading after `instant`. The result is always a real instant outside
    the quiet hours and the search never loops.
    """
    if not is_quiet_at(instant_ms, quiet):
        return instant_ms
    today = user_local_day(instant_ms, quiet.time_zone)
    end = quiet.end_minutes
    candidates: list[int] = []
    for offset in range(3):
        wall = civil_day_ms(add_civil_days(today, offset)) + end * MS_PER_MINUTE
        candidates.extend(instants_from_wall(wall, quiet.time_zone))
    ordered = sorted(candidates)
    for candidate in ordered:
        if candidate > instant_ms and not is_quiet_at(candidate, quiet):
            return candidate
    raise ValueError("quiet hours end not found")


def wall_clock_ms(instant_ms: int, time_zone: str) -> int:
    """The local wall clock of an instant, as the epoch milliseconds of those fields."""
    return wall_ms_of(instant_ms, time_zone)


def from_instant_ms(value: int) -> object:
    """Helper kept for the tests: the datetime of an epoch millisecond."""
    return from_epoch_ms(value)
