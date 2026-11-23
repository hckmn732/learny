"""Automation settings, journal and expiration (SPEC-2205, SPEC-711 ET-5 and BR-AUT-12).

Ported from `listMyAutomations`, `updateMyAutomationSetting`, `listMyAutomationActions` and
`expirePendingActions` of `packages/automations/src/moteur-d-automatismes.ts`. Every read and every
write of the learner runs in ONE transaction under the learner's RLS (ET-3): a foreign identifier is
simply absent, never a disclosure (CL-1). The domain rules live in
`learny.engagement.domain.automations`; this module only loads, applies and projects.
"""

from collections.abc import Mapping
from typing import Any

from learny.engagement.application.effect_runner import apply_effects
from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.automations import (
    AUTOMATION_KEYS,
    ParamsError,
    decode_cursor,
    encode_cursor,
    params_or_stored,
    start_of_user_week,
    validate_params,
)
from learny.engagement.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as engagement_fr
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import parse_iso, to_epoch_ms, to_iso, user_local_day

LIMIT_DEFAULT = 20
LIMIT_MAX = 100
TONE_TU = "tu"
TONE_VOUS = "vous"


async def _profile(tx: Any, user_id: str) -> tuple[str, str]:
    """The zone and the tutor tone of the learner; a missing profile is a 404, like the engine."""
    row = await queries.read_profile(tx, user_id)
    if row is None:
        raise AppError("NOT_FOUND", engagement_fr.SETTINGS_PROFILE_NOT_FOUND)
    tone = TONE_TU if row["tutor_tone"] == TONE_TU else TONE_VOUS
    return str(row["timezone"]), tone


def action_to_dto(row: queries.AutomationActionRow) -> dict[str, Any]:
    """ET-3 - one journal row in the shape of `AutomationActionItem`."""
    return {
        "id": row.id,
        "automation": row.automation,
        "kind": row.kind,
        "summary": row.summary,
        "formationId": row.formation_id,
        "payload": dict(row.payload),
        "undoPayload": None if row.undo_payload is None else dict(row.undo_payload),
        "requiresConsent": row.requires_consent,
        "status": row.status,
        "decidedAt": None if row.decided_at is None else to_iso(row.decided_at),
        "createdAt": to_iso(row.created_at),
    }


def setting_to_dto(row: queries.AutomationSettingRow) -> dict[str, Any]:
    """EF-3 - one stored setting, with its parameters already canonical."""
    return {
        "automation": row.key,
        "enabled": row.enabled,
        "params": params_or_stored(row.key, row.params),
        "updatedAt": to_iso(row.updated_at),
    }


async def list_my_automations(deps: EngagementDeps, actor: Actor) -> dict[str, Any]:
    """GET /api/v1/me/automations - the ten settings of the learner and the pause state."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        time_zone, _tone = await _profile(tx, actor.user_id)
        rows = await queries.read_automation_settings(tx, actor.user_id)
        by_key = {row.key: row for row in rows}
        items: list[dict[str, Any]] = []
        for key in AUTOMATION_KEYS:
            row = by_key.get(key)
            items.append(
                {
                    "automation": key,
                    "enabled": True if row is None else row.enabled,
                    "params": params_or_stored(key, {} if row is None else row.params),
                    "updatedAt": None if row is None else to_iso(row.updated_at),
                }
            )
        local_day = user_local_day(to_epoch_ms(now), time_zone)
        paused = await queries.read_active_pause(tx, actor.user_id, local_day) is not None
        return {"items": items, "paused": paused}


def _params_error(path: str, message: str) -> AppError:
    """`updateMyAutomationSetting`'s validation error, with the zod path and message."""
    field = f"params.{path}"
    return AppError(
        "VALIDATION_FAILED",
        fr.FIELD_INVALID.format(path=field, message=message),
        errors=[{"path": field, "message": message}],
    )


async def update_my_automation_setting(
    deps: EngagementDeps, actor: Actor, body: Mapping[str, Any]
) -> dict[str, Any]:
    """PATCH /api/v1/me/automations - validates `params`, then upserts the row."""
    now = deps.clock.now()
    automation = str(body["automation"])
    async with deps.db.user_tx(actor) as tx:
        await _profile(tx, actor.user_id)
        rows = await queries.read_automation_settings(tx, actor.user_id)
        current = next((row for row in rows if row.key == automation), None)
        params = {} if current is None else dict(current.params)
        sent = body.get("params")
        if sent is not None:
            try:
                params = validate_params(automation, sent)
            except ParamsError as error:
                raise _params_error(error.path, error.message) from error
        requested = body.get("enabled")
        enabled = bool(requested) if requested is not None else (True if current is None else current.enabled)
        row = await queries.upsert_automation_setting(
            tx, user_id=actor.user_id, key=automation, enabled=enabled, params=params, now=now
        )
        return setting_to_dto(row)


async def list_my_automation_actions(
    deps: EngagementDeps, actor: Actor, query: Mapping[str, Any]
) -> dict[str, Any]:
    """GET /api/v1/me/automation-actions - one stable page plus the weekly counter."""
    now = deps.clock.now()
    requested = query.get("limit")
    limit = LIMIT_DEFAULT if requested is None else min(max(int(requested), 1), LIMIT_MAX)
    raw_cursor = query.get("cursor")
    cursor = decode_cursor(str(raw_cursor)) if raw_cursor is not None else None
    async with deps.db.user_tx(actor) as tx:
        time_zone, _tone = await _profile(tx, actor.user_id)
        since_raw = query.get("since")
        since = None if since_raw is None else parse_iso(str(since_raw))
        page = await queries.list_automation_actions(
            tx,
            user_id=actor.user_id,
            status=query.get("status"),
            kind=query.get("kind"),
            automation=query.get("automation"),
            formation_id=query.get("formationId"),
            since=since,
            limit=limit,
            cursor=None if cursor is None else (str(cursor[0]), cursor[1]),
        )
        week_count = await queries.count_automation_actions_since(
            tx, actor.user_id, start_of_user_week(now, time_zone)
        )
        return {
            "items": [action_to_dto(row) for row in page.rows],
            "weekCount": week_count,
            "nextCursor": None
            if page.next_cursor is None
            else encode_cursor(page.next_cursor[0], page.next_cursor[1]),
        }


async def expire_due_automation_actions(deps: EngagementDeps) -> int:
    """CL-3 - the hourly tick: expires the pending actions whose `expiresAt` has passed.

    Ported from `expirePendingActions` and wired to the worker in SPEC-2207. It runs on the service
    role because it sweeps every learner, exactly like the TypeScript `engine.sdb` tick.
    """
    now = deps.clock.now()
    async with deps.db.service_tx() as tx:
        return await queries.expire_due_automation_actions(tx, now)


__all__ = [
    "action_to_dto",
    "expire_due_automation_actions",
    "list_my_automation_actions",
    "list_my_automations",
    "setting_to_dto",
    "update_my_automation_setting",
]


# --- decisions of the learner (EF-2, EF-3, ET-5, CL-1 to CL-4) ----------------------------------
#
# Ported from `acceptAutomationAction`, `declineAutomationAction` and `undoAutomationAction` of
# `packages/automations/src/moteur-d-automatismes.ts`. One transaction under the learner's RLS:
# the row is locked first, a foreign identifier is a 404, a replayed decision returns the committed
# answer with no second effect, and the definition decides the effects the use case executes.


def _registry() -> Any:
    """The product registry, built lazily so the import graph stays acyclic."""
    from learny.engagement.domain.automations.definitions import product_registry

    return product_registry()


def _view(row: queries.AutomationActionRow) -> Any:
    from learny.engagement.domain.automations import ActionView

    return ActionView(
        id=row.id,
        automation=row.automation,
        kind=row.kind,
        summary=row.summary,
        formation_id=row.formation_id,
        payload=dict(row.payload),
        undo_payload=None if row.undo_payload is None else dict(row.undo_payload),
        requires_consent=row.requires_consent,
        status=row.status,
        decided_at=None if row.decided_at is None else to_iso(row.decided_at),
        created_at=to_iso(row.created_at),
    )


def _context(now: Any, user_id: str, time_zone: str, tone: str, deps: EngagementDeps) -> Any:
    from learny.engagement.domain.automations import EffectContext

    return EffectContext(user_id=user_id, time_zone=time_zone, tone=tone, now=now)


async def _apply_definition(
    deps: EngagementDeps,
    tx: Any,
    *,
    actor: Actor,
    row: queries.AutomationActionRow,
    definition: Any,
    decision: str,
    choice: Mapping[str, Any] | None,
    now: Any,
    time_zone: str,
    tone: str,
) -> queries.AutomationActionRow:
    """Applies the effect at consent time, then writes the payload and the summary of the row."""
    payload = dict(row.payload)
    if choice is not None and decision == "accept":
        payload = {**payload, "choice": dict(choice)}
    view = _view(
        queries.AutomationActionRow(
            id=row.id,
            formation_id=row.formation_id,
            automation=row.automation,
            kind=row.kind,
            summary=row.summary,
            payload=payload,
            undo_payload=row.undo_payload,
            requires_consent=row.requires_consent,
            status="applied",
            decided_at=row.decided_at,
            created_at=row.created_at,
        )
    )
    effect = definition.apply(_context(now, actor.user_id, time_zone, tone, deps), view)
    assignments = await apply_effects(tx, user_id=actor.user_id, now=now, effects=effect.effects)
    changes = dict(effect.changes)
    payload_after = changes.get("payload")
    payload_after = payload if payload_after is None else dict(payload_after)
    payload_after = {**payload_after, **dict(assignments.payload)}
    undo_after = changes.get("undo_payload")
    undo_present = "undo_payload" in changes
    if undo_present and undo_after is not None:
        undo_after = {**dict(undo_after), **dict(assignments.undo)}
    summary = definition.explain(
        _view(
            queries.AutomationActionRow(
                id=row.id,
                formation_id=row.formation_id,
                automation=row.automation,
                kind=row.kind,
                summary=row.summary,
                payload=payload_after,
                undo_payload=None if undo_after is None else dict(undo_after),
                requires_consent=row.requires_consent,
                status="applied",
                decided_at=row.decided_at,
                created_at=row.created_at,
            )
        ),
        tone,
        time_zone,
    )
    return await queries.update_automation_action_effect(
        tx,
        user_id=actor.user_id,
        action_id=row.id,
        summary=summary,
        payload=payload_after,
        undo_payload=None if undo_after is None else dict(undo_after),
        undo_present=undo_present,
    )


async def _decide(
    deps: EngagementDeps, actor: Actor, action_id: str, decision: str, choice: Mapping[str, Any] | None
) -> dict[str, Any]:
    now = deps.clock.now()
    target = "applied" if decision == "accept" else "declined"
    async with deps.db.user_tx(actor) as tx:
        time_zone, tone = await _profile(tx, actor.user_id)
        status = await queries.lock_automation_action_status(tx, user_id=actor.user_id, action_id=action_id)
        if status is None:
            raise AppError("NOT_FOUND", fr.ACTION_NOT_FOUND)
        if status == target:
            existing = await queries.read_automation_action(tx, user_id=actor.user_id, action_id=action_id)
            if existing is None:
                raise AppError("NOT_FOUND", fr.ACTION_NOT_FOUND)
            return action_to_dto(existing)
        if status != "pending_consent":
            raise AppError("CONFLICT", fr.DECISION_NOT_PENDING)
        row = await queries.decide_automation_action(
            tx, user_id=actor.user_id, action_id=action_id, status=target, now=now
        )
        definition = _registry().get(row.automation)
        if decision == "accept" and definition is not None and definition.apply is not None:
            row = await _apply_definition(
                deps,
                tx,
                actor=actor,
                row=row,
                definition=definition,
                decision=decision,
                choice=choice,
                now=now,
                time_zone=time_zone,
                tone=tone,
            )
        if decision == "accept":
            await tx.emit(
                "automation/action-applied",
                {"userId": actor.user_id, "actionId": row.id, "automation": row.automation},
                event_id=f"automation-action-applied:{row.id}",
            )
        if decision == "decline" and definition is not None:
            summary = definition.explain(_view(row), tone, time_zone)
            row = await queries.update_automation_action_effect(
                tx,
                user_id=actor.user_id,
                action_id=row.id,
                summary=summary,
                payload=None,
                undo_payload=None,
                undo_present=False,
            )
        final = await queries.read_automation_action(tx, user_id=actor.user_id, action_id=action_id)
        if final is None:
            raise AppError("NOT_FOUND", fr.ACTION_NOT_FOUND)
        return action_to_dto(final)


async def accept_automation_action(
    deps: EngagementDeps, actor: Actor, action_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """EF-3, ET-5 - accepts a pending action and applies the effect once (CA-2, CL-3)."""
    choice = body.get("choice")
    return await _decide(deps, actor, action_id, "accept", choice if isinstance(choice, Mapping) else None)


async def decline_automation_action(deps: EngagementDeps, actor: Actor, action_id: str) -> dict[str, Any]:
    """EF-2, ET-5 - declines a pending action; the journal keeps the row (BR-AUT-12)."""
    return await _decide(deps, actor, action_id, "decline", None)


async def undo_automation_action(deps: EngagementDeps, actor: Actor, action_id: str) -> dict[str, Any]:
    """EF-3, CL-4 - undoes an applied action; a consumed action answers 422."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        time_zone, tone = await _profile(tx, actor.user_id)
        current = await queries.read_automation_action(tx, user_id=actor.user_id, action_id=action_id)
        if current is None:
            raise AppError("NOT_FOUND", fr.ACTION_NOT_FOUND)
        if current.status == "consumed":
            raise AppError("AUTOMATION_ACTION_CONSUMED", fr.UNDO_CONSUMED)
        if current.status == "undone":
            return action_to_dto(current)
        if current.status != "applied":
            raise AppError("CONFLICT", fr.UNDO_NOT_APPLIED)
        if current.undo_payload is None:
            raise AppError("VALIDATION_FAILED", fr.UNDO_NO_PAYLOAD)
        definition = _registry().get(current.automation)
        if definition is not None and definition.undo is not None:
            effect = definition.undo(_context(now, actor.user_id, time_zone, tone, deps), _view(current))
            await apply_effects(tx, user_id=actor.user_id, now=now, effects=effect.effects)
        row = await queries.undo_automation_action(tx, user_id=actor.user_id, action_id=action_id, now=now)
        summary = row.summary
        if definition is not None:
            summary = definition.explain(_view(row), tone, time_zone)
            row = await queries.update_automation_action_effect(
                tx,
                user_id=actor.user_id,
                action_id=row.id,
                summary=summary,
                payload=None,
                undo_payload=None,
                undo_present=False,
            )
        await tx.emit(
            "automation/action-undone",
            {"userId": actor.user_id, "actionId": row.id, "automation": row.automation},
            event_id=f"automation-action-undone:{row.id}",
        )
    # ADR-0191 section 3 - the proposal comes back right after the undo, on a suffixed dedupe key;
    # the undone row stays in the journal (BR-AUT-12). A failing proposal never cancels the undo.
    if definition is not None and definition.repropose_after_undo and current.status == "applied":
        await _repropose_after_undo(deps, actor, current, definition, now, time_zone, tone)
    return action_to_dto(row)


async def _repropose_after_undo(
    deps: EngagementDeps,
    actor: Actor,
    current: queries.AutomationActionRow,
    definition: Any,
    now: Any,
    time_zone: str,
    tone: str,
) -> None:
    """Writes the new pending proposal on the service role, as the TypeScript engine does."""
    payload = {
        key: value
        for key, value in dict(current.payload).items()
        if key not in ("chosenStartsAt", "appliedAt", "choice")
    }
    base_key = str(payload.get("dedupeKey") or definition.key)
    payload["dedupeKey"] = f"{base_key}#undo:{to_epoch_ms(now)}"
    view = _view(
        queries.AutomationActionRow(
            id=current.id,
            formation_id=current.formation_id,
            automation=current.automation,
            kind=current.kind,
            summary=current.summary,
            payload=payload,
            undo_payload=None,
            requires_consent=current.requires_consent,
            status="pending_consent",
            decided_at=None,
            created_at=now,
        )
    )
    summary = definition.explain(view, tone, time_zone)
    try:
        async with deps.db.service_tx() as tx:
            await queries.insert_reproposed_action(
                tx,
                user_id=actor.user_id,
                formation_id=current.formation_id,
                automation=current.automation,
                kind=current.kind,
                summary=summary,
                payload=payload,
                requires_consent=current.requires_consent,
                now=now,
            )
    except Exception:
        logger = getattr(deps, "logger", None)
        if logger is not None:
            logger.warn("automation repropose failed", outcome="repropose_failed")
