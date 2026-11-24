"""Streak, regularity strip and milestones (SPEC-409, BR-GAM-01, BR-GAM-03, ADR-0033, ADR-0281).

Every input is explicit: the local reference day comes from the injected instant and time zone,
the business bounds come from the caller. Detection of milestones is a pure set difference, so a
recalculation never emits the same milestone twice (CL-5).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from learny.learning.domain.errors import invalid_input
from learny.learning.domain.time import add_days, iso_weekday, local_date_of
from learny.learning.domain.types import DateRange

STREAK_ACTIVITY_KINDS = (
    "global_quiz",
    "micro_session",
    "quiz",
    "exercise",
    "exam",
    "reading",
    "contribution",
)
MILESTONE_KINDS = ("module_validated", "notions_100", "streak_30")
MILESTONE_KEY = {"notions": "notions_100", "streak": "streak_30"}


@dataclass(frozen=True, slots=True)
class DailyActivityEntry:
    """One completed activity; `duration_seconds` only qualifies a reading day."""

    at: str
    kind: str
    duration_seconds: int = 0


@dataclass(frozen=True, slots=True)
class StreakParams:
    """Business bounds supplied by the caller (`ENGINE.streak` in the application)."""

    reading_min_seconds: int
    regularity_days: int
    max_lookback_days: int


@dataclass(frozen=True, slots=True)
class StreakCalendarDay:
    """One box of the regularity strip; `studied` wins over every neutrality rule."""

    date: str
    status: str

    def to_dict(self) -> dict[str, Any]:
        return {"date": self.date, "status": self.status}


@dataclass(frozen=True, slots=True)
class StreakResult:
    """Current streak, oldest-first calendar and last qualifying day."""

    days: int
    calendar: tuple[StreakCalendarDay, ...]
    last_qualifying_day: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "days": self.days,
            "calendar": [day.to_dict() for day in self.calendar],
            "lastQualifyingDay": self.last_qualifying_day,
        }


def _normalise_pauses(pauses: Sequence[Any]) -> list[DateRange]:
    """Merges overlapping or touching pause ranges, sorted by start day."""
    ranges: list[dict[str, str]] = []
    for raw in pauses:
        parsed = raw if isinstance(raw, DateRange) else DateRange.read(raw)
        ranges.append({"startsOn": parsed.starts_on, "endsOn": parsed.ends_on})
    ranges.sort(key=lambda item: item["startsOn"])
    merged: list[dict[str, str]] = []
    for pause in ranges:
        last = merged[-1] if merged else None
        if last is not None and pause["startsOn"] <= last["endsOn"]:
            if pause["endsOn"] > last["endsOn"]:
                last["endsOn"] = pause["endsOn"]
        else:
            merged.append(pause)
    return [DateRange(starts_on=item["startsOn"], ends_on=item["endsOn"]) for item in merged]


def _is_paused(date: str, pauses: Sequence[DateRange]) -> bool:
    return any(pause.starts_on <= date <= pause.ends_on for pause in pauses)


def _read_activity(raw: Any, index: int) -> DailyActivityEntry:
    if not isinstance(raw, dict):
        raise invalid_input(f"dailyActivity.{index}", "An activity object is required.")
    at, kind = raw.get("at"), raw.get("kind")
    if not isinstance(at, str):
        raise invalid_input(f"dailyActivity.{index}.at", "Invalid instant.")
    if kind not in STREAK_ACTIVITY_KINDS:
        raise invalid_input(f"dailyActivity.{index}.kind", "Unknown activity kind.")
    duration = raw.get("durationSeconds", 0)
    if not isinstance(duration, int) or isinstance(duration, bool) or duration < 0:
        raise invalid_input(f"dailyActivity.{index}.durationSeconds", "A non-negative integer is required.")
    return DailyActivityEntry(at=at, kind=str(kind), duration_seconds=duration)


def calculate_streak(
    daily_activity: Sequence[Any],
    study_days: Sequence[int],
    pauses: Sequence[Any],
    at: str,
    time_zone: str,
    params: StreakParams,
) -> StreakResult:
    """ET-1: current streak, 14-day regularity strip and last qualifying day (ADR-0033)."""
    if not study_days or any(day not in (1, 2, 3, 4, 5, 6, 7) for day in study_days):
        raise invalid_input("studyDays", "At least one ISO weekday is required.")
    if params.reading_min_seconds < 1 or params.regularity_days < 1 or params.max_lookback_days < 1:
        raise invalid_input("params", "Strictly positive bounds are required.")
    today = local_date_of(at, time_zone)
    planned_days = set(study_days)
    merged_pauses = _normalise_pauses(pauses)

    studied_days: set[str] = set()
    for index, raw in enumerate(daily_activity):
        activity = _read_activity(raw, index)
        day = local_date_of(activity.at, time_zone)
        if day > today:
            continue
        qualifies = activity.kind != "reading" or activity.duration_seconds >= params.reading_min_seconds
        if qualifies:
            studied_days.add(day)

    days = 0
    cursor = today
    for _walked in range(params.max_lookback_days):
        if cursor in studied_days:
            days += 1
        elif cursor == today or _is_paused(cursor, merged_pauses) or iso_weekday(cursor) not in planned_days:
            pass
        else:
            break
        cursor = add_days(cursor, -1)

    calendar: list[StreakCalendarDay] = []
    for offset in range(params.regularity_days - 1, -1, -1):
        date = add_days(today, -offset)
        if date in studied_days:
            status = "studied"
        elif date == today or _is_paused(date, merged_pauses) or iso_weekday(date) not in planned_days:
            status = "neutral"
        else:
            status = "missed"
        calendar.append(StreakCalendarDay(date=date, status=status))

    qualifying = sorted(studied_days)
    return StreakResult(
        days=days, calendar=tuple(calendar), last_qualifying_day=qualifying[-1] if qualifying else None
    )


@dataclass(frozen=True, slots=True)
class MilestoneParams:
    """Business bounds supplied by the caller (`ENGINE.milestones` in the application)."""

    notions_retained: int
    streak_days: int


@dataclass(frozen=True, slots=True)
class Milestone:
    """A new milestone; `module_id` is set only for a validated module."""

    key: str
    kind: str
    module_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return {"key": self.key, "kind": self.kind, "moduleId": self.module_id}


def module_milestone_key(module_id: str) -> str:
    """Stable key of a validated module, shared with the persistence service (SPEC-411)."""
    return f"module_validated:{module_id}"


def detect_milestones(
    previous_keys: Sequence[str],
    validated_modules: Sequence[str],
    mastered_notions: int,
    streak_days: int,
    params: MilestoneParams,
) -> list[Milestone]:
    """New milestones in a stable order: modules (sorted), 100 notions, 30-day streak."""
    if params.notions_retained < 1 or params.streak_days < 1:
        raise invalid_input("params", "Strictly positive bounds are required.")
    if mastered_notions < 0 or streak_days < 0:
        raise invalid_input("masteredNotions", "A non-negative integer is required.")
    previous = set(previous_keys)
    milestones: list[Milestone] = []
    for module_id in sorted(set(validated_modules)):
        key = module_milestone_key(module_id)
        if key not in previous:
            milestones.append(Milestone(key=key, kind="module_validated", module_id=module_id))
    if mastered_notions >= params.notions_retained and MILESTONE_KEY["notions"] not in previous:
        milestones.append(Milestone(key=MILESTONE_KEY["notions"], kind="notions_100", module_id=None))
    if streak_days >= params.streak_days and MILESTONE_KEY["streak"] not in previous:
        milestones.append(Milestone(key=MILESTONE_KEY["streak"], kind="streak_30", module_id=None))
    return milestones
