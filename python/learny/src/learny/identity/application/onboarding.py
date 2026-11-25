"""Onboarding state and advancement (SPEC-602 ET-1, ET-2, EF-1, EF-8, EF-10, EF-13; SPEC-2201).

The stored step is monotone (`max(stored, requested)`), the side effects of a request still apply
when the step does not move, and the completion event is written in the same transaction with a
stable identifier so two clicks can never emit it twice.
"""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from learny.identity.application.me import read_me
from learny.identity.application.ports import IdentityDeps
from learny.identity.domain.actor import Actor
from learny.identity.infrastructure import queries
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import PROFILE_NOT_FOUND
from learny.shared.product import (
    AUTOMATION_DEFAULTS,
    NOTIFICATION_DEFAULT_EMAIL,
    NOTIFICATION_DEFAULT_PUSH,
    ONBOARDING_AUTOMATION_KEYS,
    STUDY_DEFAULTS,
)
from learny.shared.time import to_iso

# `RANK` of `advance.ts`: the order of the steps, `done` last.
RANK: Mapping[str, int] = {
    "profil": 0,
    "rythme": 1,
    "ia": 2,
    "rappels": 3,
    "depart": 4,
    "done": 5,
}

QUALIFIED_TASK_COUNT = 5


def default_preferences() -> dict[str, Any]:
    """`defaultPreferences`: the product defaults of SPEC-102, never a page-local copy."""
    return {
        "hoursPerDay": STUDY_DEFAULTS["hoursPerDay"],
        "studyDays": list(STUDY_DEFAULTS["studyDays"]),
        "preferredSlots": list(STUDY_DEFAULTS["preferredSlots"]),
    }


async def read_preferences(tx: Tx, user_id: str) -> dict[str, Any]:
    """Rhythm of the learner, or the defaults when the row is absent (`readPreferences`)."""
    row = await queries.read_preferences(tx, user_id)
    if row is None:
        return default_preferences()
    return {
        "hoursPerDay": row.hours_per_day,
        "studyDays": list(row.study_days),
        "preferredSlots": list(row.preferred_slots),
    }


async def read_reminders(tx: Tx, user_id: str) -> dict[str, Any]:
    """The three reminder switches of the onboarding screen (`readReminders`)."""
    notification = await queries.read_notification_settings(tx, user_id)
    automations = await queries.read_automation_settings(tx, user_id, list(ONBOARDING_AUTOMATION_KEYS))
    return {
        "push": NOTIFICATION_DEFAULT_PUSH if notification is None else notification.channel_push,
        "email": NOTIFICATION_DEFAULT_EMAIL if notification is None else notification.channel_email,
        "automations": (
            len(automations) == len(ONBOARDING_AUTOMATION_KEYS)
            and all(automations.get(key, False) for key in ONBOARDING_AUTOMATION_KEYS)
        ),
    }


async def get_onboarding_state(deps: IdentityDeps, actor: Actor) -> dict[str, Any]:
    """`GET /api/v1/me/onboarding` - profile, rhythm and reminder switches in one read."""
    async with deps.db.user_tx(actor) as tx:
        profile = await read_me(tx, actor.user_id)
        preferences = await read_preferences(tx, actor.user_id)
        reminders = await read_reminders(tx, actor.user_id)
        return {"profile": profile, "preferences": preferences, "reminders": reminders}


async def apply_reminder_choices(tx: Tx, user_id: str, reminders: Mapping[str, Any], now: datetime) -> None:
    """`applyReminderChoicesInTx`: writes the three switches inside the caller's transaction."""
    await queries.upsert_notification_settings(
        tx,
        user_id,
        bool(reminders["push"]),
        bool(reminders["email"]),
        now,
    )
    for key in ONBOARDING_AUTOMATION_KEYS:
        await queries.upsert_automation_setting(
            tx,
            user_id,
            key,
            bool(reminders["automations"]),
            AUTOMATION_DEFAULTS[key],
            now,
        )


async def has_five_qualified_assignments(tx: Tx, user_id: str) -> bool:
    """`hasFiveQualifiedAssignments`: one qualified personal model on each of the five tasks."""
    return await queries.count_qualified_tasks(tx, user_id) >= QUALIFIED_TASK_COUNT


async def advance_onboarding(
    deps: IdentityDeps,
    actor: Actor,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """`PATCH /api/v1/me/onboarding` - moves the step forward and emits the completion once."""
    now = deps.clock.now()
    requested = str(body["step"])
    reminders = body.get("reminders")
    async with deps.db.user_tx(actor) as tx:
        current = await queries.lock_profile(tx, actor.user_id)
        if current is None:
            raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)

        stored = current.onboarding_step
        # The AI key is optional to finish the configuration (QA, 2026-11-25): the learner can
        # add it later in Settings; the AI features answer AI_UNAVAILABLE until then.

        if isinstance(reminders, Mapping):
            await apply_reminder_choices(tx, actor.user_id, reminders, now)

        next_step = requested if RANK[requested] > RANK[stored] else stored
        completes = next_step == "done" and current.onboarding_completed_at is None
        completed_at = now if completes else current.onboarding_completed_at
        if next_step != stored or completes:
            await queries.update_onboarding_step(
                tx,
                actor.user_id,
                next_step,
                completed_at,
                now,
            )
        if completes:
            await tx.emit(
                "user/onboarding-completed",
                {
                    "userId": actor.user_id,
                    "completedAt": to_iso(completed_at if completed_at is not None else now),
                },
                event_id=f"user-onboarding-completed:{actor.user_id}",
            )
        return {"onboardingStep": next_step}
