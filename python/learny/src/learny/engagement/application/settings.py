"""Notifications tab of the settings screen (SPEC-2205).

The stored row stays `notification_settings` (SPEC-102, SPEC-209): this service only normalises it
for the screen and writes a partial patch in ONE transaction under the learner's RLS transaction.
The in-app channel is always on. A stale `expectedUpdatedAt` answers 409 and leaves the row
untouched (CL-2).
"""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from learny.engagement.application.ports import EngagementDeps
from learny.engagement.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr
from learny.shared.time import to_iso

TYPE_FIELDS: tuple[str, ...] = (
    "revision",
    "validation",
    "course",
    "gap",
    "planning",
    "relaunch",
)
SETTINGS_COLUMNS = {
    "revision": "type_revision",
    "validation": "type_validation",
    "course": "type_course",
    "gap": "type_gap",
    "planning": "type_planning",
    "relaunch": "type_relaunch",
}


def active_notification_type_count(types: Mapping[str, bool]) -> int:
    """CA-1 - the "N of 6 enabled" counter of the six type switches."""
    return len([name for name in TYPE_FIELDS if bool(types.get(name))])


def quiet_hours_of(start: str, end: str) -> dict[str, Any]:
    """ET-4, CL-5 - the quiet window as displayed; `start = end` is the empty range."""
    source = start[:5]
    target = end[:5]
    return {
        "start": source,
        "end": target,
        "crossesMidnight": source > target,
        "empty": source == target,
    }


def notification_settings_to_dto(row: queries.SettingsRow) -> dict[str, Any]:
    """ET-3 - normalised DTO, in the shape the generated contract validates."""
    types = {
        "revision": row.type_revision,
        "validation": row.type_validation,
        "course": row.type_course,
        "gap": row.type_gap,
        "planning": row.type_planning,
        "relaunch": row.type_relaunch,
    }
    return {
        "channels": {"app": True, "email": row.channel_email, "browser": row.channel_push},
        "types": types,
        "digestTime": row.digest_time,
        "quiet": quiet_hours_of(row.quiet_start, row.quiet_end),
        "weekendQuiet": row.weekend_quiet,
        "maxPerDay": row.max_per_day,
        "activeTypeCount": active_notification_type_count(types),
        "updatedAt": to_iso(row.updated_at),
    }


async def _require_profile(tx: Any, user_id: str) -> None:
    if await queries.read_profile(tx, user_id) is None:
        # CL-1 - another owner's identifier never reveals whether a row exists.
        raise AppError("NOT_FOUND", fr.SETTINGS_NOT_FOUND)


async def _read_row(tx: Any, user_id: str) -> queries.SettingsRow:
    """BR-NOT-04 - the sign-up trigger normally created the row; a missing one gets the defaults."""
    row = await queries.select_settings(tx, user_id)
    if row is not None:
        return row
    await queries.insert_default_settings(tx, user_id)
    created = await queries.select_settings(tx, user_id)
    if created is None:
        raise AppError("NOT_FOUND", fr.SETTINGS_NOT_FOUND)
    return created


async def _read_row_for_update(tx: Any, user_id: str) -> queries.SettingsRow:
    row = await queries.select_settings(tx, user_id, for_update=True)
    if row is not None:
        return row
    await queries.insert_default_settings(tx, user_id)
    created = await queries.select_settings(tx, user_id, for_update=True)
    if created is None:
        raise AppError("NOT_FOUND", fr.SETTINGS_NOT_FOUND)
    return created


async def get_notification_settings(deps: EngagementDeps, actor: Actor) -> dict[str, Any]:
    """GET /api/v1/me/notification-settings - the settings of the authenticated learner."""
    async with deps.db.user_tx(actor) as tx:
        await _require_profile(tx, actor.user_id)
        return notification_settings_to_dto(await _read_row(tx, actor.user_id))


def _patch_values(patch: Mapping[str, Any], now: datetime) -> dict[str, Any]:
    """`coalesce` of the query: a field the caller did not send stays unchanged (`None`)."""
    channels = patch.get("channels")
    types = patch.get("types")
    channel_map = channels if isinstance(channels, Mapping) else {}
    type_map = types if isinstance(types, Mapping) else {}
    values: dict[str, Any] = {
        "channel_email": channel_map.get("email"),
        "channel_push": channel_map.get("browser"),
        "digest_time": patch.get("digestTime"),
        "quiet_start": patch.get("quietStart"),
        "quiet_end": patch.get("quietEnd"),
        "weekend_quiet": patch.get("weekendQuiet"),
        "max_per_day": patch.get("maxPerDay"),
        "updated_at": now,
    }
    for name, column in SETTINGS_COLUMNS.items():
        values[column] = type_map.get(name)
    return values


async def update_notification_settings(
    deps: EngagementDeps, actor: Actor, patch: Mapping[str, Any]
) -> dict[str, Any]:
    """PATCH /api/v1/me/notification-settings - partial patch, one transaction, no push touched."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        await _require_profile(tx, actor.user_id)
        row = await _read_row_for_update(tx, actor.user_id)
        expected = patch.get("expectedUpdatedAt")
        if expected is not None and to_iso(row.updated_at) != str(expected):
            raise AppError("CONFLICT", fr.SETTINGS_CONFLICT, status=409)
        await queries.patch_settings(tx, actor.user_id, _patch_values(patch, now))
        return notification_settings_to_dto(await _read_row(tx, actor.user_id))


__all__ = [
    "SETTINGS_COLUMNS",
    "TYPE_FIELDS",
    "active_notification_type_count",
    "get_notification_settings",
    "notification_settings_to_dto",
    "quiet_hours_of",
    "update_notification_settings",
]
