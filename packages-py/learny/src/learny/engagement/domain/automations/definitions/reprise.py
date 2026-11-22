"""Catch-up after an absence (SPEC-712, BR-AUT-04, ADR-0190, ADR-0191 section 3).

Ported from `packages/automations/src/definitions/reprise.ts`: the one-line explanation of the four
kinds and of every status (both tones), and the effects of the three explicit choices of the learner
(``shift_end`` / ``lighten`` recorded, five-minute restart placed, missed session replaced). The
definition never reads the database: the replacement reads the missed slot inside the effect
executor, and the journal identifiers come back through the assignments.
"""

from typing import Any

from learny.engagement.domain.automations.definitions.labels import (
    clip,
    day_of,
    format_day_in_sentence,
    format_hour,
    number_or_null,
    string_of,
)
from learny.engagement.domain.automations.effects import (
    CancelSlot,
    InsertSlot,
    ReplaceMissedSlot,
    RestoreReplacedSlot,
)
from learny.engagement.domain.automations.model import (
    ActionView,
    AppliedEffect,
    AutomationDefinition,
    DraftError,
    EffectContext,
)
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import to_iso

PREFIXES = {
    "declined": fr.SUMMARY_DECLINED_PREFIX,
    "expired": fr.SUMMARY_EXPIRED_PREFIX,
    "undone": fr.SUMMARY_UNDONE_PREFIX,
}
APPLIED_STATUSES = ("applied", "consumed")


def _title(action: ActionView) -> str:
    return string_of(action.payload.get("title"), fr.REPRISE_DEFAULT_TITLE)


def _formation_title(action: ActionView) -> str:
    return string_of(action.payload.get("formationTitle"), fr.REPRISE_DEFAULT_FORMATION)


def _count_label(days: float) -> str:
    value = int(days)
    return fr.REPRISE_ONE_DAY if value == 1 else fr.REPRISE_MANY_DAYS.format(count=value)


def _option_label(option: dict[str, Any]) -> str:
    return fr.REPRISE_PLAN_SHIFT_END if option.get("kind") == "shift_end" else fr.REPRISE_PLAN_LIGHTEN


def _sentence_day(value: str) -> str:
    return value[:-1] if value.endswith(".") else value


def _reference(action: ActionView) -> str:
    created_on = string_of(action.payload.get("createdOn"))
    if action.created_at:
        return action.created_at
    return created_on if created_on != "" else "1970-01-01T00:00:00.000Z"


def _applied_starts_at(action: ActionView, proposed: dict[str, Any], reference: str) -> str:
    if action.status in APPLIED_STATUSES:
        return string_of(action.payload.get("chosenStartsAt"), string_of(proposed.get("startsAt"), reference))
    return string_of(proposed.get("startsAt"), reference)


def _summarize(action: ActionView, tone: str, time_zone: str) -> str:
    applied = action.status in APPLIED_STATUSES
    reference = _reference(action)
    tu = tone == "tu"
    payload = dict(action.payload)
    kind = action.kind
    if kind == "reprise_proposed":
        proposed = payload.get("proposed")
        proposed = proposed if isinstance(proposed, dict) else {}
        starts_at = _applied_starts_at(action, proposed, reference)
        in_buffer = proposed.get("inBuffer") is not False
        missed_day = format_day_in_sentence(
            string_of(payload.get("missedDate"), day_of(starts_at, time_zone)), reference, time_zone
        )
        slot_day = format_day_in_sentence(day_of(starts_at, time_zone), reference, time_zone)
        hour = format_hour(starts_at, time_zone)
        if applied:
            template = fr.REPRISE_NOTE_TU if tu else fr.REPRISE_NOTE_VOUS
            return template.format(title=_title(action), day=slot_day, hour=hour)
        template = fr.REPRISE_PROPOSED_TU if tu else fr.REPRISE_PROPOSED_VOUS
        where = (
            (fr.REPRISE_BUFFER_TU if tu else fr.REPRISE_BUFFER_VOUS)
            if in_buffer
            else (fr.REPRISE_FREE_TU if tu else fr.REPRISE_FREE_VOUS)
        )
        return template.format(
            title=_title(action), missed_day=_sentence_day(missed_day), day=slot_day, hour=hour, where=where
        )
    if kind == "slot_rescheduled":
        proposed = payload.get("proposed")
        proposed = proposed if isinstance(proposed, dict) else {}
        starts_at = _applied_starts_at(action, proposed, reference)
        template = fr.REPRISE_NOTE_TU if tu else fr.REPRISE_NOTE_VOUS
        return template.format(
            title=_title(action),
            day=format_day_in_sentence(day_of(starts_at, time_zone), reference, time_zone),
            hour=format_hour(starts_at, time_zone),
        )
    if kind == "reprise_short_proposed":
        proposed = payload.get("proposed")
        proposed = proposed if isinstance(proposed, dict) else {}
        starts_at = _applied_starts_at(action, proposed, reference)
        day = format_day_in_sentence(day_of(starts_at, time_zone), reference, time_zone)
        hour = format_hour(starts_at, time_zone)
        if applied:
            template = fr.REPRISE_SHORT_APPLIED_TU if tu else fr.REPRISE_SHORT_APPLIED_VOUS
            return template.format(day=day, hour=hour)
        days = number_or_null(payload.get("inactiveDays")) or 2
        template = fr.REPRISE_SHORT_PROPOSED_TU if tu else fr.REPRISE_SHORT_PROPOSED_VOUS
        return template.format(days=int(days), day=day, hour=hour)
    if kind == "plan_change_proposed":
        options = payload.get("options")
        options = options if isinstance(options, list) else []
        chosen = string_of(payload.get("chosenOption"))
        if applied and chosen != "":
            found = next(
                (option for option in options if isinstance(option, dict) and option.get("kind") == chosen),
                None,
            )
            label = (
                _option_label(found)
                if found is not None
                else (fr.REPRISE_PLAN_SHIFT_END if chosen == "shift_end" else fr.REPRISE_PLAN_LIGHTEN)
            )
            return fr.REPRISE_PLAN_APPLIED.format(formation=_formation_title(action), option=label.lower())
        if payload.get("reason") == "no_room":
            return fr.REPRISE_PLAN_NO_ROOM.format(title=_title(action))
        days = number_or_null(payload.get("inactiveDays")) or 5
        return fr.REPRISE_PLAN_INACTIVE.format(days=_count_label(days), formation=_formation_title(action))
    return fr.REPRISE_UNKNOWN_KIND.format(kind=kind)


def explain(action: ActionView, tone: str, time_zone: str) -> str:
    """EF-8 - one line, at most 160 characters, with the prefix of a final status."""
    return clip(f"{PREFIXES.get(action.status, '')}{_summarize(action, tone, time_zone)}")


def _choice_starts_at(action: ActionView) -> tuple[str, str, dict[str, Any] | None]:
    payload = dict(action.payload)
    proposed = payload.get("proposed")
    proposed = proposed if isinstance(proposed, dict) else {}
    choice = payload.get("choice")
    chosen = string_of(choice.get("startsAt")) if isinstance(choice, dict) else ""
    alternatives = payload.get("alternatives")
    alternative = None
    if chosen != "" and isinstance(alternatives, list):
        alternative = next(
            (entry for entry in alternatives if isinstance(entry, dict) and entry.get("startsAt") == chosen),
            None,
        )
        if alternative is None:
            raise DraftError("VALIDATION_FAILED", fr.REPRISE_CHOICE_INVALID)
    placement = alternative or proposed
    return string_of(placement.get("startsAt")), string_of(placement.get("endsAt")), payload


def apply(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Apply the explicit choice of the learner inside the transaction."""
    payload = dict(action.payload)
    kind = action.kind
    if kind == "plan_change_proposed":
        choice = payload.get("choice")
        option = string_of(choice.get("option")) if isinstance(choice, dict) else ""
        if option not in ("shift_end", "lighten"):
            raise DraftError("VALIDATION_FAILED", fr.REPRISE_UNKNOWN_OPTION)
        return AppliedEffect(
            changes={
                "payload": {**payload, "chosenOption": option, "appliedAt": to_iso(ctx.now)},
                "undo_payload": {"planOption": option},
            }
        )
    starts_at, ends_at, _payload = _choice_starts_at(action)
    if starts_at == "" or ends_at == "":
        raise DraftError("VALIDATION_FAILED", fr.REPRISE_UNKNOWN_KIND.format(kind=kind))
    formation_id = string_of(payload.get("formationId"), action.formation_id or "")
    if formation_id == "":
        raise DraftError("VALIDATION_FAILED", fr.REPRISE_UNKNOWN_KIND.format(kind=kind))
    if kind == "reprise_short_proposed":
        return AppliedEffect(
            changes={
                "payload": {**payload, "chosenStartsAt": starts_at, "appliedAt": to_iso(ctx.now)},
                "undo_payload": {},
            },
            effects=(
                InsertSlot(
                    formation_id=formation_id,
                    kind="micro_session",
                    title=fr.REPRISE_SHORT_SLOT_TITLE,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    assign_undo="createdSlotId",
                ),
            ),
        )
    missed_slot_id = string_of(payload.get("missedSlotId"))
    if kind in ("reprise_proposed", "slot_rescheduled") and missed_slot_id != "":
        return AppliedEffect(
            changes={
                "payload": {**payload, "chosenStartsAt": starts_at, "appliedAt": to_iso(ctx.now)},
                "undo_payload": {},
            },
            effects=(
                ReplaceMissedSlot(
                    missed_slot_id=missed_slot_id,
                    starts_at=starts_at,
                    ends_at=ends_at,
                    assign_undo="createdSlotId",
                ),
            ),
        )
    raise DraftError("VALIDATION_FAILED", fr.REPRISE_UNKNOWN_KIND.format(kind=kind))


def undo(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Cancel the created slot and put the missed one back when it was replaced."""
    undo_payload = dict(action.undo_payload or {})
    created = string_of(undo_payload.get("createdSlotId"))
    missed = string_of(action.payload.get("missedSlotId"))
    effects: list[Any] = []
    if created != "" and missed != "":
        effects.append(RestoreReplacedSlot(created_slot_id=created, missed_slot_id=missed))
    elif created != "":
        effects.append(CancelSlot(slot_id=created))
    return AppliedEffect(effects=tuple(effects))


DEFINITION = AutomationDefinition(
    key="reprise",
    triggers=(
        {"type": "hourly", "localHour": 22},
        {"type": "hourly", "localHour": 8},
        {"type": "direct"},
    ),
    explain=explain,
    apply=apply,
    undo=undo,
    repropose_after_undo=True,
)


__all__ = ["DEFINITION", "explain"]
