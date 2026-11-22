"""Automation settings, journal and expiration (SPEC-2205, SPEC-711 ET-5 and BR-AUT-12).

Ported from `listMyAutomations`, `updateMyAutomationSetting`, `listMyAutomationActions` and
`expirePendingActions` of `packages/automations/src/moteur-d-automatismes.ts`. Every read and every
write of the learner runs in ONE transaction under the learner's RLS (ET-3): a foreign identifier is
simply absent, never a disclosure (CL-1). The domain rules live in
`learny.engagement.domain.automations`; this module only loads, applies and projects.
"""

from collections.abc import Mapping
from typing import Any

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
