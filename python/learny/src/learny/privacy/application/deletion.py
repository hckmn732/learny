"""Account deletion request and cancellation (SPEC-211 EF-5, EF-6, ET-6, CL-7; BR-ACC-11).

Scheduling is idempotent: a second call returns the same deadline and sends no second e-mail. The
session stays valid and the learner is sent to `/parametres#profil` where the cancellation is
offered. The effective deletion belongs to the nightly job, never to the HTTP request.
"""

from typing import Any, cast

from learny.engagement import public as engagement
from learny.identity.domain.actor import Actor
from learny.privacy.application.ports import PrivacyDeps
from learny.privacy.domain.archive import format_long_date
from learny.privacy.domain.deletion import scheduled_instant
from learny.privacy.infrastructure import queries
from learny.shared.errors import AppError
from learny.shared.locale_fr import privacy as fr
from learny.shared.time import to_iso


def _require_user(actor: Actor | None) -> str:
    if actor is None or actor.user_id == "":
        raise AppError("UNAUTHENTICATED", fr.UNAUTHENTICATED)
    return actor.user_id


async def schedule_deletion(deps: PrivacyDeps, actor: Actor | None) -> dict[str, str]:
    """EF-5 - schedules the deletion at J+30; a replay returns the same deadline, without e-mail."""
    user_id = _require_user(actor)
    async with deps.db.service_tx() as tx:
        profile = await queries.lock_profile_for_deletion(tx, user_id)
        if profile is None:
            raise AppError("NOT_FOUND", fr.PROFILE_NOT_FOUND)
        if profile.deletion_scheduled_for is not None:
            return {"scheduledFor": to_iso(profile.deletion_scheduled_for)}
        now = deps.clock.now()
        deadline = scheduled_instant(now)
        await queries.schedule_deletion(tx, user_id, now, deadline)
    await engagement.send_email(
        cast(Any, deps),
        user_id=user_id,
        template=fr.DELETION_SCHEDULED_TEMPLATE,
        props={"scheduledLabel": format_long_date(deadline, profile.timezone)},
        idempotency_key=f"deletion-scheduled:{user_id}:{to_iso(deadline)}",
    )
    return {"scheduledFor": to_iso(deadline)}


async def cancel_deletion(deps: PrivacyDeps, actor: Actor | None) -> None:
    """EF-6 - clears both columns; without a pending request it still answers 204."""
    user_id = _require_user(actor)
    async with deps.db.service_tx() as tx:
        await queries.cancel_deletion(tx, user_id, deps.clock.now())
    return None
