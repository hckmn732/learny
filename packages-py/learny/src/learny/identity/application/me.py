"""Profile of the authenticated learner (SPEC-601 EF-10, completed by SPEC-602; SPEC-2201).

Port of `packages/services/src/me.ts`: everything is read with the learner's own RLS transaction, so
another learner's profile never reaches the DTO. `read_me` is reused by the settings and onboarding
use cases, exactly like the TypeScript module exports it.
"""

from collections.abc import Mapping
from typing import Any

from learny.identity.application.ports import IdentityDeps
from learny.identity.domain.actor import Actor
from learny.identity.infrastructure import queries
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import PROFILE_NOT_FOUND
from learny.shared.time import to_iso


def me_dto(row: queries.MeRow) -> dict[str, Any]:
    """`toMe`: a blank or missing name is `null`; instants are ISO-8601 with milliseconds."""
    return {
        "id": row.id,
        "email": row.email,
        "firstName": _name(row.first_name),
        "lastName": _name(row.last_name),
        "tutorTone": row.tutor_tone,
        "courseLanguage": row.course_language,
        "timezone": row.timezone,
        "onboardingStep": row.onboarding_step,
        "onboardingCompletedAt": (
            None if row.onboarding_completed_at is None else to_iso(row.onboarding_completed_at)
        ),
        "currentFormationId": row.current_formation_id,
    }


def _name(value: str | None) -> str | None:
    if value is None or value.strip() == "":
        return None
    return value


async def read_me(tx: Tx, user_id: str) -> dict[str, Any]:
    """Profile DTO read inside an existing transaction (`readMe`)."""
    row = await queries.read_me(tx, user_id)
    if row is None:
        raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
    return me_dto(row)


async def get_me(deps: IdentityDeps, actor: Actor) -> dict[str, Any]:
    """`GET /api/v1/me` - the authenticated learner's profile (EF-10)."""
    async with deps.db.user_tx(actor) as tx:
        return await read_me(tx, actor.user_id)


async def update_profile(
    deps: IdentityDeps,
    actor: Actor,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """`PATCH /api/v1/me` - writes the provided profile fields, then returns the profile."""
    values = dict(body)
    for key in ("firstName", "lastName"):
        if isinstance(values.get(key), str):
            values[key] = values[key].strip()
    async with deps.db.user_tx(actor) as tx:
        updated = await queries.update_profile_fields(tx, actor.user_id, values, deps.clock.now())
        if not updated:
            raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
        return await read_me(tx, actor.user_id)
