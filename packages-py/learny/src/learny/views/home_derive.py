"""Pure derivations of the home screen (SPEC-603 ET-3, EF-1, EF-2, EF-4, EF-6, EF-7).

Port of `packages/domain/src/home/derive.ts`: every function receives its instant, its time zone
and its identifiers from the caller; nothing reads the clock, the database or the settings. The
service and the client share these rules, so the remaining minutes stay exact between two
refreshes without a second implementation.
"""

import math
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from learny.shared import time as shared_time
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import home as texts

MS_PER_MINUTE = shared_time.MS_PER_MINUTE
MS_PER_DAY = shared_time.MS_PER_DAY
DEFAULT_MODULE_THRESHOLD = 80
LONG_DEFERRED_DAY_MAX = 6
SUMMARIZED_LINE_MAX = 60
CHAPTER_PATTERN = re.compile(r"chapitre\s+(\d+)", re.IGNORECASE)
TODO_KINDS = ("warmup", "micro_session")
QUIZ_ACTION_KINDS = ("global_quiz", "revision", "sprint")


@dataclass(frozen=True, slots=True)
class DaySlot:
    """A schedule slot as the day card shows it (`SlotForState`)."""

    id: str
    kind: str
    status: str
    starts_at: str
    ends_at: str


@dataclass(frozen=True, slots=True)
class ScheduledSlot:
    """A slot with the fields its next-activity labels read (`NextActivitySlot`)."""

    kind: str
    starts_at: str
    meta: str | None


@dataclass(frozen=True, slots=True)
class ActionSlot:
    """The identifiers an action reads (`ActionSlot`)."""

    formation_id: str
    module_id: str | None
    activity_id: str | None
    kind: str


def _instant_ms(value: str) -> int:
    """Epoch milliseconds of a canonical ISO instant (`Date.parse`)."""
    return shared_time.to_epoch_ms(shared_time.parse_iso(value))


def _wall_of(instant_ms: int, time_zone: str) -> datetime:
    """The local wall clock of an instant, as fields only (`toUserZone`)."""
    return shared_time.from_epoch_ms(shared_time.wall_ms_of(instant_ms, time_zone))


def _clock_of(instant_ms: int, time_zone: str) -> str:
    """Local `HH:MM` reading of an instant."""
    local = _wall_of(instant_ms, time_zone)
    return f"{local.hour:02d}:{local.minute:02d}"


def _long_day(day: str, time_zone: str) -> str:
    """`Intl` `{weekday: long, day: numeric, month: long}`, e.g. "mercredi 11 novembre"."""
    local = _wall_of(shared_time.start_of_user_day(day, time_zone), time_zone)
    weekday = shared_time.FRENCH_WEEKDAYS[local.weekday()]
    month = shared_time.FRENCH_MONTHS_LONG[local.month - 1]
    return f"{weekday} {local.day} {month}"


def _short_day(day: str, time_zone: str) -> str:
    """`Intl` `{day: numeric, month: short, year: numeric}`, e.g. "18 sept. 2026"."""
    local = _wall_of(shared_time.start_of_user_day(day, time_zone), time_zone)
    month = shared_time.FRENCH_MONTHS_SHORT[local.month - 1]
    return f"{local.day} {month} {local.year}"


def _weekday_short_day(day: str, time_zone: str) -> str:
    """`Intl` `{weekday: short, day: numeric, month: short}`, e.g. "ven. 13 nov."."""
    local = _wall_of(shared_time.start_of_user_day(day, time_zone), time_zone)
    weekday = shared_time.FRENCH_WEEKDAYS_SHORT[local.weekday()]
    month = shared_time.FRENCH_MONTHS_SHORT[local.month - 1]
    return f"{weekday} {local.day} {month}"


def _day_difference(start: str, end: str) -> int:
    """Whole civil days between two `YYYY-MM-DD` readings (`dayDifference`)."""
    return js_round((shared_time.civil_day_ms(end) - shared_time.civil_day_ms(start)) / MS_PER_DAY)


def _capitalize(value: str) -> str:
    return value[:1].upper() + value[1:]


def _pill(values: tuple[str, str]) -> dict[str, str]:
    return {"label": values[0], "tone": values[1]}


def slot_state(slot: DaySlot, now: datetime, *, highlight_id: str | None = None) -> str:
    """EF-2: slot state of the day card, in the order of the status pill."""
    if slot.status == "done":
        return "done"
    if slot.status == "missed":
        return "missed"
    at = shared_time.to_epoch_ms(now)
    start = _instant_ms(slot.starts_at)
    end = _instant_ms(slot.ends_at)
    if slot.status == "planned" and start <= at < end:
        return "ongoing"
    if highlight_id is not None and highlight_id == slot.id:
        return "next"
    if slot.kind in TODO_KINDS:
        return "todo"
    return "upcoming"


def minutes_until(starts_at: str, now: datetime) -> int:
    """EF-2: rounded-up minutes until a future slot, never negative."""
    remaining = _instant_ms(starts_at) - shared_time.to_epoch_ms(now)
    if remaining <= 0:
        return 0
    return (remaining + MS_PER_MINUTE - 1) // MS_PER_MINUTE


def highlighted_slot(slots: Sequence[DaySlot], now: datetime) -> DaySlot | None:
    """EF-2: first planned slot that is neither a warm-up nor a micro-session."""
    at = shared_time.to_epoch_ms(now)
    candidates = [
        slot
        for slot in slots
        if slot.status == "planned" and slot.kind not in TODO_KINDS and _instant_ms(slot.starts_at) >= at
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda slot: _instant_ms(slot.starts_at))


def format_duration(minutes: float) -> str:
    """EF-2: "5 h", "1 h 30", "45 min"; whole minutes."""
    total = max(0, js_round(minutes))
    hours, rest = divmod(total, 60)
    if hours == 0:
        return texts.DURATION_MINUTES.format(minutes=rest)
    if rest == 0:
        return texts.DURATION_HOURS.format(hours=hours)
    return texts.DURATION_HOURS_MINUTES.format(hours=hours, rest=rest)


def objective_labels(objectives: Sequence[str]) -> list[str]:
    """EF-6: the French label of each known objective, in the order of the formation."""
    return [
        texts.OBJECTIVE_LABELS[objective] for objective in objectives if objective in texts.OBJECTIVE_LABELS
    ]


def module_status_pill(
    *,
    contributions_in_progress: bool,
    course_status: str | None,
    reading_percent: float | None,
    attempt_count: int,
    last_score: float | None,
    threshold: float,
) -> dict[str, str] | None:
    """EF-6: activity pill of the open module, first true wins."""
    if not contributions_in_progress:
        if last_score is not None and last_score < threshold:
            return _pill(texts.MODULE_STATUS_TO_RETAKE)
        if attempt_count == 0:
            return _pill(texts.MODULE_STATUS_TO_TAKE)
        if reading_percent is not None and reading_percent < 100:
            return _pill(texts.MODULE_STATUS_READING)
    if course_status == "generating":
        return _pill(texts.MODULE_STATUS_PREPARING)
    if contributions_in_progress:
        return _pill(texts.MODULE_STATUS_CONTRIBUTIONS)
    return None


def slot_label(kind: str) -> str:
    """EF-6: French label of a slot kind."""
    return texts.HOME_SLOT_LABELS.get(kind, kind)


def civil_day_label(day: str, time_zone: str) -> str:
    """EF-1: "Mercredi 11 novembre" from a civil day and the learner's zone."""
    return _capitalize(_long_day(day, time_zone))


def short_civil_day(day: str, time_zone: str) -> str:
    """EF-6: "11 déc. 2026" for an end or completion date."""
    return _short_day(day, time_zone)


def next_activity_label(starts_at: str, now: datetime, time_zone: str) -> str:
    """EF-6: "Aujourd'hui, 14:00", "Demain, 17:30" or "jeu. 12 nov., 09:00"."""
    starts_ms = _instant_ms(starts_at)
    today = shared_time.user_local_day(shared_time.to_epoch_ms(now), time_zone)
    day = shared_time.user_local_day(starts_ms, time_zone)
    clock = _clock_of(starts_ms, time_zone)
    difference = _day_difference(today, day)
    if difference == 0:
        return texts.NEXT_ACTIVITY_TODAY.format(time=clock)
    if difference == 1:
        return texts.NEXT_ACTIVITY_TOMORROW.format(time=clock)
    return texts.NEXT_ACTIVITY_DATED.format(date=_weekday_short_day(day, time_zone), time=clock)


def next_activity_detail(kind: str, meta: str | None) -> str:
    """EF-6: type label of the next activity, with the chapter of a contributions slot."""
    label = slot_label(kind)
    if kind != "contributions":
        return label
    match = CHAPTER_PATTERN.search(meta or "")
    if match is None:
        return label
    return texts.NEXT_ACTIVITY_CHAPTER.format(label=label, chapter=match.group(1))


def next_activity(slot: ScheduledSlot | None, now: datetime, time_zone: str) -> dict[str, str] | None:
    """EF-6: the next activity, `null` when the formation has no slot left."""
    if slot is None:
        return None
    return {
        "when": next_activity_label(slot.starts_at, now, time_zone),
        "detail": next_activity_detail(slot.kind, slot.meta),
    }


def deferred_day_label(day: str, today: str, time_zone: str) -> str:
    """EF-4: deferred day, long name within six days, short date afterwards."""
    difference = _day_difference(today, day)
    if 0 <= difference <= LONG_DEFERRED_DAY_MAX:
        return shared_time.FRENCH_WEEKDAYS[
            _wall_of(shared_time.start_of_user_day(day, time_zone), time_zone).weekday()
        ].lower()
    return _weekday_short_day(day, time_zone)


def completed_summary(
    *,
    start_date: str | None,
    completed_at: str | None,
    volume_hours: int | None,
    time_zone: str,
) -> dict[str, Any]:
    """EF-7: "4 semaines · 60 h" of a completed formation."""
    if completed_at is None:
        return {"completedOn": None, "dateLabel": None, "weeks": None, "hours": volume_hours}
    completed_ms = _instant_ms(completed_at)
    completed_on = shared_time.user_local_day(completed_ms, time_zone)
    weeks = None if start_date is None else max(1, math.ceil(_day_difference(start_date, completed_on) / 7))
    return {
        "completedOn": completed_on,
        "dateLabel": _short_day(completed_on, time_zone),
        "weeks": weeks,
        "hours": volume_hours,
    }


def module_href(formation_id: str, module_id: str | None) -> str:
    """Module page of a formation, with its open module when known."""
    if module_id is None:
        return f"/formations/{formation_id}/programme"
    return f"/formations/{formation_id}/modules/{module_id}"


def primary_action_for(slot: ActionSlot | None) -> dict[str, str] | None:
    """ET-4: main action of the highlighted slot; buffer, weekly review and nothing return None."""
    if slot is None:
        return None
    formation_id = slot.formation_id
    module = module_href(formation_id, slot.module_id)
    if slot.kind == "validation_quiz":
        return {"label": texts.PRIMARY_START_VALIDATION_QUIZ, "href": f"{module}/quiz"}
    if slot.kind == "course":
        return {"label": texts.PRIMARY_RESUME_COURSE, "href": f"{module}/cours"}
    if slot.kind == "contributions":
        return {"label": texts.PRIMARY_SUBMIT_CONTRIBUTIONS, "href": module}
    if slot.kind == "exercise":
        href = f"{module}/exercices" if slot.activity_id is None else f"{module}/exercices/{slot.activity_id}"
        return {"label": texts.PRIMARY_DO_EXERCISE, "href": href}
    if slot.kind in QUIZ_ACTION_KINDS:
        return {"label": texts.PRIMARY_REVIEW_NOW, "href": f"/formations/{formation_id}/quiz-global"}
    if slot.kind == "mock_exam":
        return {"label": texts.PRIMARY_START_MOCK_EXAM, "href": f"/formations/{formation_id}/examen-blanc"}
    return None


def slot_href(slot: ActionSlot) -> str:
    """EF-2: pill link of a warm-up or a micro-session, the main action otherwise."""
    if slot.kind == "warmup":
        return texts.SLOT_ANCHOR_WARMUP
    if slot.kind == "micro_session":
        return f"/formations/{slot.formation_id}/quiz-global?mode=micro"
    action = primary_action_for(slot)
    if action is not None:
        return action["href"]
    return module_href(slot.formation_id, slot.module_id)
