"""Gap game of the automations (SPEC-716, BR-AUT-05, ADR-0190).

Ported from `packages/automations/src/definitions/jeu-lacune.ts`: the explanation of the three
natures and of the six statuses, and the effect of an `exercise_scheduled` proposal (one practice
slot). When the exercise could not be prepared yet the action keeps `pendingGeneration` - the same
branch as an unavailable AI, which the job of SPEC-2207 will fill.
"""

from typing import Any

from learny.engagement.domain.automations.definitions.labels import (
    clip,
    day_of,
    format_day_in_sentence,
    format_hour,
    string_of,
)
from learny.engagement.domain.automations.effects import CancelSlot, InsertSlot
from learny.engagement.domain.automations.model import (
    ActionView,
    AppliedEffect,
    AutomationDefinition,
    DraftError,
    EffectContext,
)
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import to_iso


def _format_label(value: str) -> str:
    if value in fr.GAME_FORMAT:
        return fr.GAME_FORMAT[value]
    return fr.GAME_FORMAT_DEFAULT


def _pending(payload: dict[str, Any]) -> str:
    return fr.GAME_PENDING_SUFFIX if payload.get("pendingGeneration") is True else ""


def _applied_game(payload: dict[str, Any]) -> str:
    notion = string_of(payload.get("notionLabel"), fr.GAME_NOTION_DEFAULT)
    if payload.get("nature") == "confusion":
        return fr.GAME_APPLIED_CONFUSION.format(
            notion=notion,
            format=_format_label(string_of(payload.get("format"))),
            confusion=string_of(payload.get("confusedWithLabel")),
            pending=_pending(payload),
        )
    return fr.GAME_APPLIED_CARD.format(notion=notion, pending=_pending(payload))


def _applied_exercise(payload: dict[str, Any], time_zone: str) -> str:
    notion = string_of(payload.get("notionLabel"), fr.GAME_NOTION_DEFAULT)
    starts_at = string_of(payload.get("startsAt"))
    if starts_at == "":
        return fr.GAME_EXERCISE_NO_SLOT.format(notion=notion)
    day = day_of(starts_at, time_zone)
    return fr.GAME_EXERCISE_SLOT.format(
        notion=notion,
        day=format_day_in_sentence(day, starts_at, time_zone),
        hour=format_hour(starts_at, time_zone),
    )


def explain(action: ActionView, _tone: str, time_zone: str) -> str:
    """EF-9 - one line for every status; no pronoun, identical in `vous` and `tu`."""
    payload = dict(action.payload)
    notion = string_of(payload.get("notionLabel"), fr.GAME_NOTION_DEFAULT)
    if action.status == "undone":
        if action.kind == "exercise_scheduled":
            return clip(fr.GAME_UNDONE_EXERCISE.format(notion=notion))
        return clip(
            fr.GAME_UNDONE_CARD.format(notion=notion, format=_format_label(string_of(payload.get("format"))))
        )
    if action.status == "expired":
        return clip(fr.GAME_EXPIRED.format(notion=notion))
    if action.kind == "exercise_scheduled":
        return clip(_applied_exercise(payload, time_zone))
    if payload.get("nature") == "application":
        return clip(fr.GAME_APPLICATION_PENDING.format(notion=notion))
    return clip(_applied_game(payload))


def apply(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Place the practice exercise when it exists; the undo cancels that slot."""
    payload = dict(action.payload)
    if action.kind != "exercise_scheduled":
        return AppliedEffect(changes={"payload": payload, "undo_payload": {}})
    notion_id = string_of(payload.get("notionId"))
    formation_id = string_of(payload.get("formationId"), action.formation_id or "")
    if notion_id == "" or formation_id == "":
        raise DraftError("VALIDATION_FAILED", fr.GAME_INCOMPLETE)
    starts_at = string_of(payload.get("startsAt"))
    ends_at = string_of(payload.get("endsAt"))
    activity_id = string_of(payload.get("exerciseActivityId"))
    module_id = string_of(payload.get("moduleId"))
    if activity_id == "" or starts_at == "" or ends_at == "":
        # Same branch as an unavailable AI: the activity will be prepared by the job.
        return AppliedEffect(changes={"payload": {**payload, "pendingGeneration": True}, "undo_payload": {}})
    return AppliedEffect(
        changes={
            "payload": {
                **payload,
                "formationId": formation_id,
                "pendingGeneration": False,
                "appliedAt": to_iso(ctx.now),
            },
            "undo_payload": {},
        },
        effects=(
            InsertSlot(
                formation_id=formation_id,
                module_id=module_id or None,
                activity_id=activity_id,
                kind="exercise",
                title=fr.GAME_EXERCISE_TITLE,
                starts_at=starts_at,
                ends_at=ends_at,
                meta=fr.GAME_EXERCISE_META.format(notion=string_of(payload.get("notionLabel"), "Notion")),
                assign_payload="slotId",
                assign_undo="slotId",
            ),
        ),
    )


def undo(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Cancel the planned exercise slot; the exercise activity itself stays available."""
    undo_payload = dict(action.undo_payload or {})
    slot_id = string_of(undo_payload.get("slotId"))
    return AppliedEffect(effects=(CancelSlot(slot_id=slot_id),)) if slot_id != "" else AppliedEffect()


DEFINITION = AutomationDefinition(
    key="jeu_lacune",
    triggers=(
        {"type": "event", "name": "gap/detected"},
        {"type": "event", "name": "gap/nature-changed"},
        {"type": "event", "name": "gap/cleared"},
    ),
    explain=explain,
    apply=apply,
    undo=undo,
)


__all__ = ["DEFINITION", "explain"]
