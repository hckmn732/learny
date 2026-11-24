"""Emergency micro-session of the automations (SPEC-713, BR-AUT-02, ADR-0190, ADR-0192 section 1).

The four journal statuses, the slot of the five-minute session and the inbox cleanup of an undo. The
definition decides; the use case writes through the effect specifications of
`domain/automations/effects.py`.
"""

from typing import Any

from learny.engagement.domain.automations.definitions.labels import (
    clip,
    format_day_in_sentence,
    number_or,
    string_of,
)
from learny.engagement.domain.automations.effects import CancelSlot, InsertSlot, MarkNotificationRead
from learny.engagement.domain.automations.model import (
    ActionView,
    AppliedEffect,
    AutomationDefinition,
    DraftError,
    EffectContext,
)
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import from_epoch_ms, local_time_to_instant, to_iso

DEFAULT_DURATION = 5
DEFAULT_HOUR = 20
MS_PER_MINUTE = 60_000


def _duration(payload: dict[str, Any]) -> int:
    return int(number_or(payload.get("durationMin"), DEFAULT_DURATION))


def _hour(payload: dict[str, Any]) -> int:
    return int(number_or(payload.get("hour"), DEFAULT_HOUR))


def _day_label(day: str, time_zone: str) -> str:
    return format_day_in_sentence(day, f"{day}T12:00:00Z", time_zone)


def explain(action: ActionView, tone: str, time_zone: str) -> str:
    """EF-8 - the four statuses of the journal, in both tones."""
    payload = dict(action.payload)
    duration = _duration(payload)
    hour = _hour(payload)
    day = string_of(payload.get("date"), action.created_at[:10] if action.created_at else "")
    if action.status == "consumed":
        return clip(fr.MICRO_CONSUMED.format(duration=duration))
    if action.status == "expired":
        return clip(fr.MICRO_EXPIRED.format(duration=duration, hour=hour))
    if action.status == "undone":
        return clip(fr.MICRO_UNDONE.format(duration=duration, day=_day_label(day, time_zone)))
    if action.status == "declined":
        return clip(fr.MICRO_DECLINED.format(duration=duration, hour=hour))
    return clip(fr.MICRO_PENDING["tu" if tone == "tu" else "vous"].format(duration=duration, hour=hour))


def apply(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Insert the five-minute slot of the proposal, with the identifier the undo cancels."""
    payload = dict(action.payload)
    formation_id = string_of(payload.get("formationId"), action.formation_id or "")
    date = string_of(payload.get("date"))
    if formation_id == "" or date == "":
        raise DraftError("VALIDATION_FAILED", fr.GAME_INCOMPLETE)
    start = from_epoch_ms(local_time_to_instant(date, f"{_hour(payload)}:00", ctx.time_zone))
    end = from_epoch_ms(
        local_time_to_instant(date, f"{_hour(payload)}:00", ctx.time_zone)
        + _duration(payload) * MS_PER_MINUTE
    )
    return AppliedEffect(
        changes={
            "payload": {**payload, "formationId": formation_id, "appliedAt": to_iso(ctx.now)},
            "undo_payload": {},
        },
        effects=(
            InsertSlot(
                formation_id=formation_id,
                kind="micro_session",
                title=fr.MICRO_SLOT_TITLE,
                starts_at=to_iso(start),
                ends_at=to_iso(end),
                meta=fr.MICRO_SLOT_META.format(duration=_duration(payload)),
                assign_payload="slotId",
                assign_undo="slotId",
            ),
        ),
    )


def undo(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Cancel the planned slot and remove the proposal from the in-app inbox."""
    undo_payload = dict(action.undo_payload or {})
    slot_id = string_of(undo_payload.get("slotId"))
    effects: list[Any] = []
    if slot_id != "":
        effects.append(CancelSlot(slot_id=slot_id))
    effects.append(MarkNotificationRead(dedupe_key=f"automation:{action.id}"))
    return AppliedEffect(effects=tuple(effects))


DEFINITION = AutomationDefinition(
    key="micro_seance",
    triggers=({"type": "hourly", "localHour": DEFAULT_HOUR}, {"type": "direct"}),
    explain=explain,
    apply=apply,
    undo=undo,
)


__all__ = ["DEFINITION", "explain"]
