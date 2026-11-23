"""Study rhythm of the learner (SPEC-602 ET-1; SPEC-2201).

One RLS transaction, the whole tuple replaced by the PATCH, and `NOT_FOUND` when the learner has no
row.
"""

from collections.abc import Mapping
from typing import Any

from learny.identity.application.ports import IdentityDeps
from learny.identity.domain.actor import Actor
from learny.identity.infrastructure import queries
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import PREFERENCES_NOT_FOUND


def preferences_dto(row: queries.PreferenceRow) -> dict[str, Any]:
    """`StudyPreferencesDto`: the three values of the rhythm, in contract order."""
    return {
        "hoursPerDay": row.hours_per_day,
        "studyDays": list(row.study_days),
        "preferredSlots": list(row.preferred_slots),
    }


async def get_preferences(deps: IdentityDeps, actor: Actor) -> dict[str, Any]:
    """`GET /api/v1/me/preferences` - current rhythm of the learner."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.read_preferences(tx, actor.user_id)
        if row is None:
            raise AppError("NOT_FOUND", PREFERENCES_NOT_FOUND)
        return preferences_dto(row)


async def update_preferences(
    deps: IdentityDeps,
    actor: Actor,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """`PATCH /api/v1/me/preferences` - replaces the three values of the rhythm."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.upsert_preferences(
            tx,
            actor.user_id,
            int(body["hoursPerDay"]),
            [int(day) for day in body["studyDays"]],
            [str(slot) for slot in body["preferredSlots"]],
            deps.clock.now(),
        )
        if row is None:
            raise AppError("NOT_FOUND", PREFERENCES_NOT_FOUND)
        return preferences_dto(row)
