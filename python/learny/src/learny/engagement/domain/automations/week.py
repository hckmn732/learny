"""Local weeks of the learner, from the injected instant and the IANA zone (SPEC-2205).

Nothing reads the process clock or the process zone (ADR-0047): the instant is always a parameter.
"""

from dataclasses import dataclass
from datetime import date, datetime

from learny.shared.time import (
    add_civil_days,
    from_epoch_ms,
    start_of_user_day,
    to_epoch_ms,
    user_local_day,
    user_weekday,
)


@dataclass(frozen=True, slots=True)
class WeeklyReviewWeek:
    """The local week a review covers, plus the Monday of the following week."""

    week_key: str
    week_start: str
    week_end: str
    next_week_start: str
    local_day: str
    weekday: int


def start_of_user_week(now: datetime, time_zone: str) -> datetime:
    """BR-AUT-12 - first instant of the learner's local week (Monday 00:00)."""
    milliseconds = to_epoch_ms(now)
    today = user_local_day(milliseconds, time_zone)
    monday = add_civil_days(today, -(user_weekday(milliseconds, time_zone) - 1))
    return from_epoch_ms(start_of_user_day(monday, time_zone))


def iso_week_key(day: str) -> str:
    """ISO year-week (`2026-W45`) of a civil day; an unreadable day is returned unchanged."""
    try:
        parsed = date.fromisoformat(day)
    except ValueError:
        return day
    year, week, _ = parsed.isocalendar()
    return f"{year}-W{week:02d}"


def weekly_review_week(now: datetime, time_zone: str) -> WeeklyReviewWeek:
    """ET-2, ET-3 - the local week of the review: Monday, the local day, the next Monday."""
    milliseconds = to_epoch_ms(now)
    local_day = user_local_day(milliseconds, time_zone)
    weekday = user_weekday(milliseconds, time_zone)
    week_start = add_civil_days(local_day, -(weekday - 1))
    return WeeklyReviewWeek(
        week_key=iso_week_key(week_start),
        week_start=week_start,
        week_end=local_day,
        next_week_start=add_civil_days(week_start, 7),
        local_day=local_day,
        weekday=weekday,
    )
