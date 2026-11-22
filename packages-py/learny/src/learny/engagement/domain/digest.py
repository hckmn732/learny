"""Pure rules of the daily digest (SPEC-2205, ported from `packages/notifications/src/digest.ts`).

The digest lists the activities of the learner's local day (at most twenty, the rest summarised in
`plannedLabel`) and the notifications capped the previous local day (at most ten titles). The
duration rounding is the `Math.round` of the TypeScript, applied to a positive difference.
"""

import math
from collections.abc import Sequence
from datetime import datetime
from typing import Any, Protocol

from learny.shared.locale_fr import engagement as fr
from learny.shared.time import (
    FRENCH_MONTHS_LONG,
    FRENCH_WEEKDAYS,
    MS_PER_MINUTE,
    add_civil_days,
    from_epoch_ms,
    to_epoch_ms,
    wall_ms_of,
)

DIGEST_ACTIVITY_LIMIT = 20
DIGEST_HELD_LIMIT = 10
DIGEST_HREF = "/aujourdhui"
DIGEST_MAX_PER_DAY = 5


class DigestSlotLike(Protocol):
    """One planned or done slot, as the SQL row exposes it."""

    @property
    def kind(self) -> str: ...

    @property
    def title(self) -> str: ...

    @property
    def meta(self) -> str | None: ...

    @property
    def starts_at(self) -> datetime: ...

    @property
    def ends_at(self) -> datetime: ...

    @property
    def formation_title(self) -> str: ...


def js_round(value: float) -> int:
    """`Math.round` of a positive value: ties go up, never to the even integer."""
    return math.floor(value + 0.5)


def minutes_between(start: datetime, end: datetime) -> int:
    """Whole minutes between two instants, rounded like the TypeScript difference."""
    return js_round((to_epoch_ms(end) - to_epoch_ms(start)) / MS_PER_MINUTE)


def slot_minutes(start: datetime, end: datetime) -> int:
    """The contribution of one slot to the planned duration, never negative."""
    return max(0, minutes_between(start, end))


def global_quiz_minutes(start: datetime, end: datetime) -> int:
    """The duration of the global quiz block: at least one minute."""
    return max(1, minutes_between(start, end))


def duration_label(minutes: int) -> str:
    """`durationLabel`: minutes, exact hours, or hours and minutes."""
    hours = minutes // 60
    rest = minutes % 60
    if hours == 0:
        return fr.DIGEST_MINUTES.format(minutes=rest)
    if rest == 0:
        return fr.DIGEST_HOURS.format(hours=hours)
    return fr.DIGEST_HOURS_MINUTES.format(hours=hours, minutes=f"{rest:02d}")


def planned_label(minutes: int, activity_count: int) -> str:
    """`plannedLabel`: the total duration, plus the activities the mail does not list."""
    hidden = max(0, activity_count - DIGEST_ACTIVITY_LIMIT)
    planned = duration_label(minutes)
    if hidden == 0:
        return planned
    return fr.DIGEST_HELD_OTHERS.format(planned=planned, count=hidden)


def previous_civil_day(day: str) -> str:
    """`previousCivilDay`: the civil day before `day`, independent of any time zone."""
    return add_civil_days(day, -1)


def activity_time(instant: datetime, time_zone: str) -> str:
    """`hhmm`: the local `HH:mm` of an instant."""
    local = from_epoch_ms(wall_ms_of(to_epoch_ms(instant), time_zone))
    return f"{local.hour:02d}:{local.minute:02d}"


def date_label(instant: datetime, time_zone: str) -> str:
    """`dateLabel`: the long local day name with its weekday and month."""
    local = from_epoch_ms(wall_ms_of(to_epoch_ms(instant), time_zone))
    return f"{FRENCH_WEEKDAYS[local.weekday()]} {local.day} {FRENCH_MONTHS_LONG[local.month - 1]}"


def activity_of(row: DigestSlotLike, time_zone: str) -> dict[str, str]:
    """One activity of the mail: time, title, detail and formation."""
    detail = row.meta if row.meta is not None else fr.DIGEST_SLOT_LABELS.get(row.kind, "")
    return {
        "time": activity_time(row.starts_at, time_zone),
        "title": row.title,
        "detail": detail,
        "formationTitle": row.formation_title,
    }


def global_quiz_of(slots: Sequence[DigestSlotLike]) -> dict[str, Any] | None:
    """The first global-quiz slot of the day, projected for the mail."""
    for slot in slots:
        if slot.kind == "global_quiz":
            return {
                "notions": 1,
                "minutes": global_quiz_minutes(slot.starts_at, slot.ends_at),
                "formationTitle": slot.formation_title,
            }
    return None


def held_max_per_day(value: object) -> int:
    """The stored cap, or the default five when the row carries another value."""
    return value if value in (3, 8) else DIGEST_MAX_PER_DAY


__all__ = [
    "DIGEST_ACTIVITY_LIMIT",
    "DIGEST_HELD_LIMIT",
    "DIGEST_HREF",
    "DIGEST_MAX_PER_DAY",
    "DigestSlotLike",
    "activity_of",
    "activity_time",
    "date_label",
    "duration_label",
    "global_quiz_minutes",
    "global_quiz_of",
    "held_max_per_day",
    "js_round",
    "minutes_between",
    "planned_label",
    "previous_civil_day",
    "slot_minutes",
]
