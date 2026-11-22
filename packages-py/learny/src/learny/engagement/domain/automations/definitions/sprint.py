"""Sprints before a milestone (SPEC-719, BR-AUT-08, ADR-0190).

Ported from `packages/automations/src/automatisme-8-sprint-avant-un-jalon.ts`: the one-line
explanation (selected notions, milestone, dates, explained impossible days) and the two effects
(cancel the future sprints of the milestone, insert the new targets with their stable planner key).
"""

from typing import Any

from learny.engagement.domain.automations.definitions.labels import (
    clip,
    format_day_in_sentence,
    format_hour,
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
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import parse_iso, to_epoch_ms, to_iso

PREFIXES = {
    "undone": fr.SUMMARY_UNDONE_PREFIX,
    "declined": fr.SUMMARY_DECLINED_PREFIX,
    "expired": fr.SUMMARY_EXPIRED_PREFIX,
}
DEFAULT_DURATION = 30
META_MAX = 1000


def _slot_sentence(slot: dict[str, Any], time_zone: str) -> str:
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
        else " et ".join(_slot_sentence(target, time_zone) for target in targets if isinstance(target, dict))
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


def _meta(payload: dict[str, Any]) -> str:
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
        if not isinstance(target, dict):
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
                planner_key=f"sprint:{exam_slot_id}:{string_of(target.get('day'))}",
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


__all__ = ["DEFINITION", "explain"]
