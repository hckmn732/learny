"""Pure rules of the global pause (SPEC-2205, SPEC-721 EF-1 to EF-3).

The French sentences live in `locale_fr` (ADR-2011): the same sentence serves the journal entry and
the settings card, so the learner never reads two wordings.
"""

from datetime import datetime
from typing import Final

from learny.engagement.domain.automations.summary import clip
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import add_civil_days, to_epoch_ms, user_local_day

DIAGNOSTIC_MINUTES: Final = 10
PAUSE_SHIFT_DAYS: Final = (3, 7, 14)


def pause_summary(kind: str, end_date: str, diagnostic_enabled: bool, tone: str) -> str:
    """`pauseSummary` - one line, at most 160 characters."""
    if kind == "pause_started":
        return clip(fr.PAUSE_STARTED["tu" if tone == "tu" else "vous"].format(end_date=end_date))
    if diagnostic_enabled:
        return clip(fr.PAUSE_ENDED_DIAGNOSTIC)
    return clip(fr.PAUSE_ENDED_DIRECT["tu" if tone == "tu" else "vous"])


def validate_pause_end_date(end_date: str, local_day: str) -> str | None:
    """EF-1, CL-3 - `None` when the civil end date is acceptable, the reason otherwise."""
    if len(end_date) != 10 or end_date[4] != "-" or end_date[7] != "-":
        return fr.PAUSE_DATE_PATTERN
    if not (end_date[:4].isdigit() and end_date[5:7].isdigit() and end_date[8:].isdigit()):
        return fr.PAUSE_DATE_PATTERN
    if end_date < local_day:
        return fr.PAUSE_DATE_ORDER
    return None


def pause_end_date_in_zone(now: datetime, time_zone: str, calendar_days: int) -> str:
    """EF-1 - the inclusive civil end date of the pause, in the profile zone."""
    return add_civil_days(user_local_day(to_epoch_ms(now), time_zone), calendar_days)


def shift_day(day: str, days: int) -> str:
    """`shiftDay` - a civil day shifted by a whole number of days."""
    return add_civil_days(day, days)
