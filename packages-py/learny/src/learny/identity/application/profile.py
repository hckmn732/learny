"""Settings screen of the learner (SPEC-707 EF-1 to EF-5, ET-1 to ET-5; SPEC-2201).

Port of `packages/services/src/parametres-onglets-et-profil.ts`: the whole screen is read in one RLS
transaction, and `PATCH /me/profile` writes the profile and the rhythm in ONE transaction with the
expected version of ET-3. A stale version answers 409 and nothing is written (CL-2).
"""

from collections.abc import Mapping
from typing import Any

from learny.identity.application.me import read_me
from learny.identity.application.ports import IdentityDeps
from learny.identity.domain.actor import Actor
from learny.identity.infrastructure import queries
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    PREFERENCES_NOT_FOUND,
    PROFILE_NOT_FOUND,
    PROFILE_VERSION_CONFLICT,
    SETTINGS_STATE_INCONSISTENT,
)
from learny.shared.time import to_iso


async def _read_rhythm(tx: Tx, user_id: str) -> dict[str, Any]:
    row = await queries.read_preferences(tx, user_id)
    if row is None:
        raise AppError("NOT_FOUND", PREFERENCES_NOT_FOUND)
    return {
        "hoursPerDay": row.hours_per_day,
        "studyDays": list(row.study_days),
        "preferredSlots": list(row.preferred_slots),
    }


def _export_dto(row: queries.ExportRow | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": row.id,
        "status": row.status,
        "sizeBytes": row.size_bytes,
        "createdAt": to_iso(row.created_at),
        "expiresAt": None if row.expires_at is None else to_iso(row.expires_at),
    }


async def read_settings_state(tx: Tx, user_id: str) -> dict[str, Any]:
    """Everything the screen renders, read in one RLS transaction (ET-1, ET-3)."""
    me = await read_me(tx, user_id)
    rhythm = await _read_rhythm(tx, user_id)
    profile = await queries.read_profile_state(tx, user_id)
    if profile is None:
        raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
    latest = await queries.read_latest_export(tx, user_id)
    return {
        "me": me,
        "rhythm": rhythm,
        "updatedAt": to_iso(profile.updated_at),
        "createdAt": to_iso(profile.created_at),
        "activeFormationCount": profile.active_formation_count,
        "deletionScheduledFor": (
            None if profile.deletion_scheduled_for is None else to_iso(profile.deletion_scheduled_for)
        ),
        "export": _export_dto(latest),
    }


async def get_settings_state(deps: IdentityDeps, actor: Actor) -> dict[str, Any]:
    """`GET /api/v1/me/profile` - the settings state of the authenticated learner."""
    async with deps.db.user_tx(actor) as tx:
        state = await read_settings_state(tx, actor.user_id)
        _assert_state(state)
        return state


async def update_settings_profile(
    deps: IdentityDeps,
    actor: Actor,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """`PATCH /api/v1/me/profile` - saves identity, language, tone, zone and rhythm at once."""
    now = deps.clock.now()
    expected = body.get("expectedUpdatedAt")
    async with deps.db.user_tx(actor) as tx:
        current = await queries.lock_profile(tx, actor.user_id)
        if current is None:
            raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
        if expected is not None and to_iso(current.updated_at) != str(expected):
            raise AppError("CONFLICT", PROFILE_VERSION_CONFLICT, status=409)
        values = {key: body[key] for key in queries.PROFILE_COLUMNS if key in body}
        for key in ("firstName", "lastName"):
            if isinstance(values.get(key), str):
                values[key] = values[key].strip()
        await queries.update_profile_fields(tx, actor.user_id, values, now)
        rhythm = body.get("rhythm")
        if isinstance(rhythm, Mapping):
            await queries.upsert_preferences(
                tx,
                actor.user_id,
                int(rhythm["hoursPerDay"]),
                [int(day) for day in rhythm["studyDays"]],
                [str(slot) for slot in rhythm["preferredSlots"]],
                now,
            )
        state = await read_settings_state(tx, actor.user_id)
        _assert_state(state)
        return state


def _assert_state(state: Mapping[str, Any]) -> None:
    """`SettingsStateSchema.safeParse`: a missing member would be an internal inconsistency."""
    required = {
        "me",
        "rhythm",
        "updatedAt",
        "createdAt",
        "activeFormationCount",
        "deletionScheduledFor",
        "export",
    }
    if not required.issubset(state.keys()):
        raise AppError("INTERNAL_ERROR", SETTINGS_STATE_INCONSISTENT)
