"""French labels of the automation explanations (SPEC-2205).

Pure functions: the zone and the reference instant are explicit, so the tests pin the words without
depending on the process clock or the machine time zone (ADR-0047, ADR-0030). The texts themselves
live in `locale_fr` (ADR-2011).
"""

from datetime import UTC, datetime
from typing import Final

from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import (
    FRENCH_MONTHS_SHORT,
    add_civil_days,
    from_epoch_ms,
    parse_iso,
    read_civil_day,
    to_epoch_ms,
    user_local_day,
    user_weekday,
    wall_ms_of,
)

SUMMARY_MAX: Final = 160
MONTHS_LONG: Final = fr.MONTHS_LONG
WEEKDAYS: Final = (
    "dimanche",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
)


def clip(value: str) -> str:
    """One line, at most 160 characters, ending with an ellipsis."""
    if len(value) <= SUMMARY_MAX:
        return value
    return f"{value[: SUMMARY_MAX - 1].rstrip()}{fr.SUMMARY_ELLIPSIS}"


def string_of(value: object, fallback: str = "") -> str:
    return value if isinstance(value, str) and value != "" else fallback


def number_or(value: object, fallback: float = 0) -> float:
    return float(value) if isinstance(value, (int, float)) and value == value else fallback


def number_or_null(value: object) -> float | None:
    return float(value) if isinstance(value, (int, float)) and value == value else None


def _date(day: str) -> datetime:
    year, month, date = (int(part) for part in day.split("-"))
    return datetime(year, month, date, tzinfo=UTC)


def day_of(instant: str, time_zone: str) -> str:
    """Civil day of an instant in the learner's zone."""
    return user_local_day(to_epoch_ms(parse_iso(instant)), time_zone)


def local_hour(instant: str, time_zone: str) -> tuple[int, int]:
    """Local hour and minute of an instant, explicit zone."""
    local = from_epoch_ms(wall_ms_of(to_epoch_ms(parse_iso(instant)), time_zone))
    return local.hour, local.minute


def format_hour(instant: str, time_zone: str) -> str:
    """`H:mm`, the hour format of the explanations (no leading zero on the hour)."""
    hour, minute = local_hour(instant, time_zone)
    return f"{hour}:{minute:02d}"


def iso_weekday(day: str) -> int:
    return _date(day).isoweekday()


def format_day_label(day: str, reference: str, time_zone: str) -> str:
    """A day of the current week keeps its weekday alone; another week shows the short date."""
    today = day_of(reference, time_zone)
    monday = add_civil_days(today, -(iso_weekday(today) - 1))
    within = monday <= day <= add_civil_days(monday, 6)
    parsed = _date(day)
    weekday = WEEKDAYS[parsed.isoweekday() % 7]
    if within:
        return weekday
    return f"{weekday} {parsed.day} {FRENCH_MONTHS_SHORT[parsed.month - 1]}"


def format_day_in_sentence(day: str, reference: str, time_zone: str) -> str:
    return format_day_label(day, reference, time_zone)


def format_slot_label(instant: str, reference: str, time_zone: str) -> str:
    """`formatSlotLabel`: a capitalised day and the local clock."""
    day = day_of(instant, time_zone)
    clock = format_hour(instant, time_zone)
    label = format_day_label(day, reference, time_zone)
    capitalized = label[:1].upper() + label[1:]
    if " " in label:
        return f"{capitalized}, {clock}"
    return f"{capitalized} {clock}"


def format_warmup_day(day: str) -> str:
    """`formatWarmupDay`: the long weekday and the long month of the warm-up explanations."""
    if read_civil_day(day) is None:
        return day
    parsed = _date(day)
    weekday = WEEKDAYS[parsed.isoweekday() % 7]
    return f"{weekday} {parsed.day} {MONTHS_LONG[parsed.month - 1]}"


def weekday_of(day: str) -> str:
    """The bare French weekday of a civil day, used by the quiz smoothing."""
    if read_civil_day(day) is None:
        return day
    return WEEKDAYS[_date(day).isoweekday() % 7]


def short_date(day: str) -> str:
    """`Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })` in UTC."""
    if read_civil_day(day) is None:
        return day
    parsed = _date(day)
    return f"{parsed.day} {FRENCH_MONTHS_SHORT[parsed.month - 1]}"


def user_weekday_of(instant_ms: int, time_zone: str) -> int:
    return user_weekday(instant_ms, time_zone)


__all__ = [
    "SUMMARY_MAX",
    "WEEKDAYS",
    "clip",
    "day_of",
    "format_day_in_sentence",
    "format_day_label",
    "format_hour",
    "format_slot_label",
    "format_warmup_day",
    "iso_weekday",
    "local_hour",
    "number_or",
    "number_or_null",
    "short_date",
    "string_of",
    "user_weekday_of",
    "weekday_of",
]
