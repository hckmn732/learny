"""Display rules of the weekly review (SPEC-2205, SPEC-720 EF-2 and ET-4).

Ported from the pure helpers of `packages/contracts/src/automatisme-9-bilan-de-la-semaine.ts`.
Every label is copied word for word from the TypeScript: « 13 h 30 », « 86 % », « Non disponible »,
the period and the reception labels. The French short names are a table, never the process locale,
so the output is identical on every host (ADR-0047).
"""

import math
import unicodedata
from collections.abc import Iterable, Sequence
from datetime import datetime
from typing import Any, Final
from zoneinfo import ZoneInfo

from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import parse_iso, to_epoch_ms

AT_RISK_MASTERY: Final = 60


def round_half_up(value: float) -> int:
    """`Math.round`: a positive half always rounds up, unlike Python's banker's rounding."""
    return math.floor(value + 0.5)


def format_weekly_study(minutes: float) -> str:
    """EF-2 - `13 h`, `13 h 30` or `0 min`, from real minutes."""
    total = max(0, round_half_up(minutes))
    hours, rest = divmod(total, 60)
    if hours == 0:
        return f"{rest} min"
    if rest == 0:
        return f"{hours} h"
    return f"{hours} h {rest}"


def weekly_retention_label(rate: float | None) -> str:
    """CL-4 - a missing measure is « Non disponible », never 0 %."""
    return fr.WEEKLY_RETENTION_UNAVAILABLE if rate is None else f"{round_half_up(rate)} %"


def short_date(day: str) -> tuple[str, str]:
    """The day number and the short French month of a civil day, as `shortDate` of the contract."""
    month = int(day[5:7])
    return (str(int(day[8:10])), fr.WEEKLY_MONTHS[month - 1])


def weekly_period_label(week_start: str, week_end: str) -> str:
    """EF-2 - « 2 - 8 nov. » (the month is written once when both days share it)."""
    start_day, start_month = short_date(week_start)
    end_day, end_month = short_date(week_end)
    if start_month == end_month:
        return fr.WEEKLY_PERIOD_SAME_MONTH.format(start_day=start_day, end_day=end_day, month=end_month)
    return fr.WEEKLY_PERIOD_RANGE.format(
        start_day=start_day, start_month=start_month, end_day=end_day, end_month=end_month
    )


def weekly_received_label(instant: str, time_zone: str) -> str:
    """EF-2 - « reçu dim. 19:00 », computed in the learner's zone."""
    local = parse_iso(instant).astimezone(ZoneInfo(time_zone))
    weekday = fr.WEEKLY_WEEKDAYS[local.isoweekday() - 1]
    return fr.WEEKLY_RECEIVED.format(weekday=weekday, time=f"{local.hour:02d}:{local.minute:02d}")


def is_at_risk_notion(
    *,
    mastery: float,
    due_at: str | None,
    gap_nature: str | None,
    gap_cleared_at: str | None,
    now: datetime,
) -> bool:
    """EF-1, ET-4 - below 60 % and either due or carrying an open gap."""
    if not math.isfinite(mastery) or mastery >= AT_RISK_MASTERY:
        return False
    if gap_nature is not None and gap_cleared_at is None:
        return True
    if due_at is None:
        return False
    try:
        return to_epoch_ms(parse_iso(due_at)) <= to_epoch_ms(now)
    except ValueError:
        return False


_TRANSLITERATION: Final = str.maketrans(
    {
        "à": "a",
        "â": "a",
        "ä": "a",
        "ç": "c",
        "é": "e",
        "è": "e",
        "ê": "e",
        "ë": "e",
        "î": "i",
        "ï": "i",
        "ô": "o",
        "ö": "o",
        "ù": "u",
        "û": "u",
        "ü": "u",
        "ÿ": "y",
        "œ": "oe",
        "æ": "ae",
    }
)


def collation_key(label: str) -> str:
    """`localeCompare(label, 'fr')` for the labels of a notion: accents are a primary difference."""
    folded = unicodedata.normalize("NFD", label.casefold())
    plain = "".join(character for character in folded if not unicodedata.combining(character))
    return plain.translate(_TRANSLITERATION)


def sort_at_risk_notions(notions: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Mastery ascending, then the French order of the labels, then the notion identifier."""
    return sorted(
        notions,
        key=lambda notion: (
            float(notion["mastery"]),
            collation_key(str(notion["label"])),
            str(notion["notionId"]),
        ),
    )


def sum_plan_minutes(plan: Iterable[dict[str, Any]]) -> int:
    """EF-2 - the planned minutes of the next local week."""
    return sum(int(day["minutes"]) for day in plan)
