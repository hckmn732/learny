"""Sprints before a milestone (SPEC-719, BR-AUT-08, ADR-0190).

The pure helpers (the two relative target days J-K and J-1, the weakest-notation ranking and the
placement of the two 30-minute slots with the planner of SPEC-407), the one-line explanation and the
two effects (cancel the future sprints of the milestone, insert the new targets with their stable
planner key).
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Final

from learny.engagement.domain.automations.definitions.labels import (
    clip,
    format_day_in_sentence,
    format_hour,
    iso_weekday,
    number_or,
    string_of,
)
from learny.engagement.domain.automations.effects import CancelSprintSlots, InsertSlot
from learny.engagement.domain.automations.model import (
    ActionView,
    AppliedEffect,
    AutomationDefinition,
    DraftError,
    EffectContext,
)
from learny.learning.domain.params import ENGINE
from learny.learning.domain.planner import (
    PlannerPreferences,
    find_compatible_slots,
)
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.prng import utf16_key
from learny.shared.time import (
    add_civil_days,
    from_epoch_ms,
    parse_iso,
    start_of_user_day,
    to_epoch_ms,
    to_iso,
    user_local_day,
)

SPRINT_PLANNED_KIND: Final = "sprint_planned"
"""ET-4 - the single kind written to the automation journal by this capacity."""

SPRINT_TARGET_LABELS: Final = ("J-K", "J-1")
NOTION_LIMIT: Final = 6
"""ET-3 - the weakest notions targeted by one plan."""

PLACEMENT_COUNT: Final = 12
"""EF-2 - the alternatives the planner may return before the day of the target is chosen."""

SLOT_LOOKBACK_MS: Final = 86_400_000
META_MAX: Final = 1000
DEFAULT_DURATION: Final = 30

PREFIXES = {
    "undone": fr.SUMMARY_UNDONE_PREFIX,
    "declined": fr.SUMMARY_DECLINED_PREFIX,
    "expired": fr.SUMMARY_EXPIRED_PREFIX,
}

CIVIL_DAY: Final = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def sprint_dedupe_key(exam_slot_id: str, exam_date: str, days_before: int) -> str:
    """A stable identity: one action per milestone slot, exam local date and K (ET-4)."""
    return f"sprint:{exam_slot_id}:{exam_date}:{days_before}"


def sprint_planner_key(exam_slot_id: str, day: str) -> str:
    """The `schedule_slots.planner_key` of one target: the milestone and the local day (EF-3)."""
    return f"sprint:{exam_slot_id}:{day}"


def sprint_target_days(exam_date: str, days_before: int) -> list[dict[str, str]]:
    """EF-1, ET-5 - J-K and J-1 as local civil days.

    `add_civil_days` keeps the calendar day across a daylight-saving change, so the targets are
    never a 24-hour duration around the clock shift.
    """
    if CIVIL_DAY.match(exam_date) is None:
        raise DraftError("VALIDATION_FAILED", fr.SPRINT_INVALID_EXAM_DATE)
    if days_before < 1 or days_before > 30:
        raise DraftError("VALIDATION_FAILED", fr.SPRINT_INVALID_DELAY)
    return [
        {"label": "J-K", "day": add_civil_days(exam_date, -days_before)},
        {"label": "J-1", "day": add_civil_days(exam_date, -1)},
    ]


def select_weakest_notions(
    rows: Sequence[Mapping[str, Any]], limit: int = NOTION_LIMIT
) -> list[dict[str, Any]]:
    """ET-3 - weakest notions first, ties broken by the stable notion identifier.

    The mastery is ascending and the identifier is compared by UTF-16 code units, exactly like the
    JavaScript `<`, so two runs on the same data always target the same notions.
    """
    kept = [dict(row) for row in rows if string_of(row.get("notionId")) != ""]
    kept.sort(key=lambda row: (float(row["mastery"]), utf16_key(str(row["notionId"]))))
    return kept[: max(0, limit)]


@dataclass(frozen=True, slots=True)
class SprintPlacement:
    """EF-2 - the placed targets, the impossible days and the slots the next placement must see."""

    targets: list[dict[str, Any]] = field(default_factory=list)
    impossible: list[dict[str, Any]] = field(default_factory=list)
    reserved: list[dict[str, Any]] = field(default_factory=list)


def _preferences_mapping(preferences: PlannerPreferences) -> dict[str, Any]:
    """The mapping form the planner boundary validates."""
    return {
        "tz": preferences.tz,
        "availability": preferences.availability.to_dict(),
        "holidays": list(preferences.holidays),
    }


def place_sprint_targets(
    *,
    exam_date: str,
    exam_slot_id: str,
    formation_id: str,
    module_id: str | None,
    days_before: int,
    duration_min: int,
    now: datetime,
    time_zone: str,
    preferences: PlannerPreferences,
    slots: Sequence[Mapping[str, Any]],
) -> SprintPlacement:
    """EF-2, CL-3 - place one 30-minute sprint per target day with the planner of SPEC-407."""
    now_ms = to_epoch_ms(now)
    today = user_local_day(now_ms, time_zone)
    study_days = set(preferences.availability.study_days)
    current: list[dict[str, Any]] = [dict(slot) for slot in slots]
    placement = SprintPlacement()
    for target in sprint_target_days(exam_date, days_before):
        day = target["day"]
        label = target["label"]
        if day < today:
            placement.impossible.append({"label": label, "day": day, "reason": "past"})
            continue
        if iso_weekday(day) not in study_days:
            placement.impossible.append({"label": label, "day": day, "reason": "no_study_day"})
            continue
        day_start = start_of_user_day(day, time_zone)
        cursor = day_start if day_start > now_ms else now_ms
        calendar = {
            "now": to_iso(from_epoch_ms(cursor)),
            "params": ENGINE["planner"],
            "slots": current,
        }
        candidates: list[dict[str, Any]] = []
        try:
            candidates = find_compatible_slots(
                {
                    "durationMinutes": duration_min,
                    "kind": "sprint",
                    "formationId": formation_id,
                    "moduleId": module_id,
                    "title": fr.SPRINT_SLOT_TITLE,
                },
                calendar,
                _preferences_mapping(preferences),
                PLACEMENT_COUNT,
            )
        except Exception:
            candidates = []
        chosen = next((candidate for candidate in candidates if candidate.get("date") == day), None)
        if chosen is None:
            placement.impossible.append({"label": label, "day": day, "reason": "no_slot"})
            continue
        placement.targets.append(
            {
                "label": label,
                "day": day,
                "slotId": None,
                "startsAt": chosen["startsAt"],
                "endsAt": chosen["endsAt"],
                "durationMin": duration_min,
            }
        )
        booked = {
            "slotId": sprint_planner_key(exam_slot_id, day),
            "formationId": formation_id,
            "moduleId": module_id,
            "kind": "sprint",
            "title": fr.SPRINT_SLOT_TITLE,
            "startsAt": chosen["startsAt"],
            "endsAt": chosen["endsAt"],
            "status": "planned",
            "createdBy": "automation",
            "movedFromId": None,
        }
        current.append(booked)
        placement.reserved.append(booked)
    return placement


def _slot_sentence(slot: Mapping[str, Any], time_zone: str) -> str:
    day = format_day_in_sentence(string_of(slot.get("day")), string_of(slot.get("startsAt")), time_zone)
    return fr.SPRINT_DAY_HOUR.format(day=day, hour=format_hour(string_of(slot.get("startsAt")), time_zone))


def explain(action: ActionView, tone: str, time_zone: str) -> str:
    """EF-2, section 10 - one line explaining the notions, the milestone and the dates."""
    payload = dict(action.payload)
    exam = string_of(payload.get("examTitle"), fr.SPRINT_DEFAULT_EXAM)
    targets = payload.get("targets")
    targets = targets if isinstance(targets, list) else []
    impossible = payload.get("impossible")
    impossible = impossible if isinstance(impossible, list) else []
    notions = payload.get("notionLabels")
    notions = notions if isinstance(notions, list) else []
    duration = int(number_or(payload.get("durationMin"), DEFAULT_DURATION))
    prefix = PREFIXES.get(action.status, "")
    if action.status == "undone":
        return clip(fr.SPRINT_UNDONE.format(exam=exam))
    dates = (
        fr.SPRINT_NO_SLOT
        if len(targets) == 0
        else " et ".join(
            _slot_sentence(target, time_zone) for target in targets if isinstance(target, Mapping)
        )
    )
    dates = dates[:1].upper() + dates[1:]
    notion_part = (
        ""
        if len(notions) == 0
        else fr.SPRINT_NOTIONS.format(notions=", ".join(str(value) for value in notions[:3]))
    )
    missing = "" if len(impossible) == 0 else fr.SPRINT_MISSING.format(count=len(impossible))
    template = fr.SPRINT_SENTENCE_TU if tone == "tu" else fr.SPRINT_SENTENCE_VOUS
    return clip(
        prefix
        + template.format(duration=duration, exam=exam, dates=dates, notions=notion_part, missing=missing)
    )


def _meta(payload: Mapping[str, Any]) -> str:
    notions = payload.get("notionLabels")
    notions = notions if isinstance(notions, list) else []
    exam = string_of(payload.get("examTitle"), fr.SPRINT_DEFAULT_EXAM)
    exam_date = string_of(payload.get("examDate"))
    text = fr.SPRINT_META.format(
        notions=", ".join(str(value) for value in notions[:3]), exam=exam, date=exam_date
    )
    return text[:META_MAX]


def apply(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Cancel the future sprints of the milestone, then insert the future targets."""
    payload = dict(action.payload)
    formation_id = string_of(payload.get("formationId"), action.formation_id or "")
    exam_slot_id = string_of(payload.get("examSlotId"))
    if formation_id == "" or exam_slot_id == "":
        raise DraftError("VALIDATION_FAILED", fr.SPRINT_INCOMPLETE)
    module_id = string_of(payload.get("moduleId"))
    targets = payload.get("targets")
    targets = targets if isinstance(targets, list) else []
    title = fr.SPRINT_TITLE.format(exam=string_of(payload.get("examTitle"), fr.SPRINT_EXAM_FALLBACK))
    meta = _meta(payload)
    effects: list[Any] = [CancelSprintSlots(formation_id=formation_id, exam_slot_id=exam_slot_id)]
    applied: list[dict[str, Any]] = []
    now_ms = to_epoch_ms(ctx.now)
    for target in targets:
        if not isinstance(target, Mapping):
            continue
        starts_at = string_of(target.get("startsAt"))
        if starts_at == "" or to_epoch_ms(parse_iso(starts_at)) <= now_ms:
            continue
        applied.append(dict(target))
        effects.append(
            InsertSlot(
                formation_id=formation_id,
                module_id=module_id or None,
                kind="sprint",
                title=title,
                starts_at=starts_at,
                ends_at=string_of(target.get("endsAt")),
                meta=meta,
                planner_key=sprint_planner_key(exam_slot_id, string_of(target.get("day"))),
            )
        )
    return AppliedEffect(
        changes={
            "payload": {**payload, "targets": applied, "appliedAt": to_iso(ctx.now)},
            "undo_payload": {"examSlotId": exam_slot_id},
        },
        effects=tuple(effects),
    )


def undo(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Cancel the future sprints of the milestone; finished ones stay in the history."""
    undo_payload = dict(action.undo_payload or {})
    formation_id = string_of(action.payload.get("formationId"), action.formation_id or "")
    exam_slot_id = string_of(undo_payload.get("examSlotId"), string_of(action.payload.get("examSlotId")))
    if formation_id == "" or exam_slot_id == "":
        return AppliedEffect()
    return AppliedEffect(effects=(CancelSprintSlots(formation_id=formation_id, exam_slot_id=exam_slot_id),))


DEFINITION = AutomationDefinition(
    key="sprint",
    triggers=({"type": "direct"}, {"type": "event", "name": "agenda/slot-moved"}),
    explain=explain,
    apply=apply,
    undo=undo,
)


__all__ = [
    "DEFINITION",
    "NOTION_LIMIT",
    "PLACEMENT_COUNT",
    "SLOT_LOOKBACK_MS",
    "SPRINT_PLANNED_KIND",
    "SPRINT_TARGET_LABELS",
    "SprintPlacement",
    "explain",
    "place_sprint_targets",
    "select_weakest_notions",
    "sprint_dedupe_key",
    "sprint_planner_key",
    "sprint_target_days",
]
