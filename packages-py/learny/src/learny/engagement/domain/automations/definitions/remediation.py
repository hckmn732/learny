"""Remediation after a failed quiz (SPEC-715, BR-AUT-03, ADR-0190).

Ported from `packages/automations/src/definitions/remediation.ts`: the one-line explanation of the
applied and undone rows, the label of the retry slot and the slot effects (a retry attempt inserted
or moved, the remediation slot when the activity exists). The preparation of the remediation
activity itself is the job of SPEC-2207; the same branch as an unavailable AI applies here.
"""

from typing import Any

from learny.engagement.domain.automations.definitions.labels import (
    clip,
    day_of,
    format_day_in_sentence,
    format_hour,
    number_or,
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

REMEDIATION_MINUTES = 15


def _plan(payload: dict[str, Any]) -> dict[str, Any]:
    plan = payload.get("plan")
    return plan if isinstance(plan, dict) else {}


def _day_label(instant: str, time_zone: str) -> str:
    return format_day_in_sentence(day_of(instant, time_zone), instant, time_zone)


def _retry_slot_label(payload: dict[str, Any], time_zone: str) -> str:
    retry = _plan(payload).get("retry")
    at = (
        string_of(retry.get("startsAt"))
        if isinstance(retry, dict)
        else string_of(payload.get("retryAvailableAt"))
    )
    if at == "":
        return fr.REMEDIATION_AT_RESUME
    return f"{_day_label(at, time_zone)} {format_hour(at, time_zone)}"


def _applied_text(payload: dict[str, Any], time_zone: str) -> str:
    score = int(number_or(payload.get("score")))
    attempt_no = int(number_or(payload.get("attemptNo"), 1))
    activity_id = string_of(payload.get("remediationActivityId"))
    when = (
        fr.REMEDIATION_AT_RESUME if payload.get("paused") is True else _retry_slot_label(payload, time_zone)
    )
    base = (
        fr.REMEDIATION_PENDING.format(score=score, attempt=attempt_no + 1, when=when)
        if activity_id == ""
        else fr.REMEDIATION_READY.format(score=score, attempt=attempt_no + 1, when=when)
    )
    mandatory = fr.REMEDIATION_MANDATORY if payload.get("mode") == "mandatory" and activity_id != "" else ""
    return f"{base}{mandatory}"


def explain(action: ActionView, _tone: str, time_zone: str) -> str:
    """EF-8 - one line, at most 160 characters, for every status of the journal."""
    if action.status == "undone":
        position = int(number_or(action.payload.get("modulePosition")))
        return clip(fr.REMEDIATION_UNDONE.format(position=position))
    return clip(_applied_text(dict(action.payload), time_zone))


def apply(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Insert the retry attempt after the remediation; the undo cancels the created slots."""
    payload = dict(action.payload)
    formation_id = string_of(payload.get("formationId"), action.formation_id or "")
    module_id = string_of(payload.get("moduleId"))
    attempt_id = string_of(payload.get("attemptId"))
    if formation_id == "" or module_id == "" or attempt_id == "":
        raise DraftError("VALIDATION_FAILED", fr.SPRINT_INCOMPLETE)
    plan = _plan(payload)
    retry = plan.get("retry")
    retry = retry if isinstance(retry, dict) else None
    effects: list[Any] = []
    applied: dict[str, Any] = {
        **payload,
        "remediationActivityId": payload.get("remediationActivityId"),
        "remediationSlotId": None,
        "retrySlotId": retry.get("slotId") if retry is not None else payload.get("retrySlotId"),
        "appliedAt": to_iso(ctx.now),
    }
    if payload.get("paused") is not True and retry is not None and retry.get("created") is True:
        title = fr.REMEDIATION_RETRY_TITLE.format(attempt=int(number_or(payload.get("attemptNo"), 1)) + 1)
        applied["retrySlotId"] = None
        effects.append(
            InsertSlot(
                formation_id=formation_id,
                module_id=module_id,
                kind="validation_quiz",
                title=title,
                starts_at=string_of(retry.get("startsAt")),
                ends_at=string_of(retry.get("endsAt")),
                meta=fr.REMEDIATION_RETRY_META,
                assign_payload="retrySlotId",
                assign_undo="retrySlotId",
            )
        )
    return AppliedEffect(
        changes={"payload": applied, "undo_payload": {"retrySlotCreated": True}},
        effects=tuple(effects),
    )


def undo(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Cancel the retry slot and the remediation slot created by the effect."""
    undo_payload = dict(action.undo_payload or {})
    effects: list[Any] = []
    for key in ("remediationSlotId", "retrySlotId"):
        slot_id = string_of(undo_payload.get(key))
        if slot_id != "":
            effects.append(CancelSlot(slot_id=slot_id))
    return AppliedEffect(effects=tuple(effects))


DEFINITION = AutomationDefinition(
    key="remediation",
    triggers=({"type": "event", "name": "quiz/graded"},),
    explain=explain,
    apply=apply,
    undo=undo,
)


__all__ = ["DEFINITION", "REMEDIATION_MINUTES", "explain"]
