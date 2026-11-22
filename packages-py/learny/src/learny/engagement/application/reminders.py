"""Validation-quiz reminders of the hourly tick (SPEC-2205).

Ported from `packages/notifications/src/producers/reminders.ts`.

The reminder of a planned quiz is requested forty minutes before it, with `eligibleAt` set to that
instant; moving a slot changes the dedupe key, so the new reminder is created while the old unsent
one is removed (CA-2). A reminder whose instant already passed is never sent late (CL-5), and a
stale producer receives `CONFLICT` with the current start of the slot (CL-2). Preferences, quiet
hours and the daily cap stay in `notify`, the only writer (BR-NOT-07).
"""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from learny.engagement.application.notify import notify
from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.reminders import (
    REMINDER_BATCH_MAX,
    parse_request,
    quiz_href,
    reminder_at,
    reminder_key,
    reminder_schedule,
    reminder_signature,
    reminder_window,
    validation_data,
)
from learny.engagement.infrastructure import queries
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr
from learny.shared.time import is_supported_time_zone, parse_iso, to_epoch_ms, to_iso


async def profile_timezone(deps: EngagementDeps, user_id: str) -> str:
    """ET-2 - the profile zone is the authority; an unusable one is refused, never silently used."""
    async with deps.db.service_tx() as tx:
        value = await queries.read_profile_timezone(tx, user_id)
    if value is None:
        raise AppError("NOT_FOUND", fr.REMINDER_PROFILE_NOT_FOUND)
    zone = str(value)
    if not is_supported_time_zone(zone):
        raise AppError(
            "VALIDATION_FAILED",
            fr.TIMEZONE_INVALID,
            errors=[{"path": "timeZone", "message": fr.TIMEZONE_INVALID}],
        )
    return zone


async def _assert_slot_version(
    deps: EngagementDeps,
    user_id: str,
    slot_id: str,
    starts_at: datetime,
) -> None:
    """CL-2 - a stale producer never overwrites a move: the current state answers `CONFLICT`."""
    async with deps.db.service_tx() as tx:
        current = await queries.read_slot_start(tx, user_id=user_id, slot_id=slot_id)
    if current is not None and to_epoch_ms(current) != to_epoch_ms(starts_at):
        raise AppError(
            "CONFLICT",
            fr.REMINDER_SLOT_MOVED,
            errors=[{"path": "startsAt", "message": to_iso(current)}],
        )


async def _delete_if_unsent(tx: Any, user_id: str, notification_id: str) -> bool:
    """BR-NOT-06, EF-2 - a delivered reminder stays in the history; an unsent one is removed."""
    if await queries.has_sent_delivery(tx, notification_id):
        return False
    await queries.delete_notification(tx, notification_id=notification_id, user_id=user_id)
    return True


async def _cancel_other_reminders(
    deps: EngagementDeps,
    user_id: str,
    slot_id: str,
    current_key: str,
) -> int:
    """EF-2 - deletes the unsent reminders of the same slot, keeping the current key."""
    async with deps.db.service_tx() as tx:
        rows = await queries.list_other_reminders(
            tx,
            user_id=user_id,
            slot_id=slot_id,
            current_key=current_key,
        )
        cancelled = 0
        for row in rows:
            if await _delete_if_unsent(tx, user_id, row.id):
                cancelled += 1
        return cancelled


async def schedule_validation_quiz_reminder(
    deps: EngagementDeps,
    raw_input: object,
) -> dict[str, Any]:
    """EF-2, BR-NOT-07 - schedules the reminder of one slot, idempotently."""
    request = parse_request(raw_input)
    time_zone = await profile_timezone(deps, request.user_id)
    await _assert_slot_version(deps, request.user_id, request.slot_id, request.starts_at)
    schedule = reminder_schedule(request.slot_id, request.starts_at, time_zone)
    full_schedule: dict[str, str] = {
        "slotId": request.slot_id,
        "startAt": to_iso(request.starts_at),
        **schedule,
    }
    now = deps.clock.now()
    if reminder_at(request.starts_at) <= now:
        cancelled = await _cancel_other_reminders(
            deps,
            request.user_id,
            request.slot_id,
            schedule["dedupeKey"],
        )
        return {
            "schedule": full_schedule,
            "notificationId": None,
            "created": False,
            "expired": True,
            "cancelled": cancelled,
        }
    data = validation_data(
        starts_at=request.starts_at,
        formation_id=request.formation_id,
        module_id=request.module_id,
        module_title=request.module_title,
        minutes=request.minutes,
        time_zone=time_zone,
        now=now,
    )
    result = await notify(
        deps,
        user_id=request.user_id,
        formation_id=request.formation_id,
        notification_type="validation_soon",
        data=data,
        dedupe_key=schedule["dedupeKey"],
        eligible_at=schedule["eligibleAt"],
        stale_at=to_iso(request.starts_at),
    )
    cancelled = await _cancel_other_reminders(
        deps,
        request.user_id,
        request.slot_id,
        schedule["dedupeKey"],
    )
    return {
        "schedule": full_schedule,
        "notificationId": result["notificationId"],
        "created": result["created"],
        "expired": False,
        "cancelled": cancelled,
    }


async def prune_validation_quiz_reminders(deps: EngagementDeps, user_id: str) -> int:
    """CA-2 - removes the reminders whose slot is no longer planned with the same start."""
    async with deps.db.service_tx() as tx:
        active_slots = await queries.list_planned_quiz_starts(tx, user_id)
        reminders = await queries.list_validation_reminders(tx, user_id)
        active = {f"{row.id}:{to_iso(row.starts_at)}" for row in active_slots}
        cancelled = 0
        for reminder in reminders:
            key = reminder.dedupe_key
            signature = None if key is None else reminder_signature(key)
            if signature is None or signature in active:
                continue
            if await _delete_if_unsent(tx, user_id, reminder.id):
                cancelled += 1
        return cancelled


async def sync_validation_quiz_reminders(
    deps: EngagementDeps,
    options: Mapping[str, Any] | None = None,
) -> dict[str, int]:
    """ET-6 - hourly generator of the reminders of the next hour, one per planned quiz."""
    now = deps.clock.now()
    window_from, window_to = reminder_window(now)
    raw_batch = None if options is None else options.get("batchSize")
    batch_size = REMINDER_BATCH_MAX if raw_batch is None else min(int(raw_batch), REMINDER_BATCH_MAX)
    async with deps.db.service_tx() as tx:
        upcoming = await queries.list_upcoming_reminder_slots(
            tx,
            window_from=window_from,
            window_to=window_to,
            limit=batch_size,
        )

    produced = 0
    created = 0
    cancelled = 0
    expired = 0
    touched: set[str] = set()
    for slot in upcoming:
        time_zone = await profile_timezone(deps, slot.user_id)
        outcome = await schedule_validation_quiz_reminder(
            deps,
            {
                "userId": slot.user_id,
                "formationId": slot.formation_id,
                "slotId": slot.id,
                **({} if slot.module_id is None else {"moduleId": slot.module_id}),
                "moduleTitle": slot.module_title if slot.module_title is not None else slot.title,
                "startsAt": to_iso(slot.starts_at),
                "timezone": time_zone,
            },
        )
        produced += 1
        if outcome["created"] is True:
            created += 1
        if outcome["expired"] is True:
            expired += 1
        cancelled += int(outcome["cancelled"])
        touched.add(slot.user_id)

    # A slot moved out of the window leaves an orphan reminder: clean the learners that still own
    # one, plus the learners just processed.
    async with deps.db.service_tx() as tx:
        owners = await queries.list_reminder_owners(tx, limit=batch_size)
    for owner in owners:
        touched.add(owner)
    for user_id in touched:
        cancelled += await prune_validation_quiz_reminders(deps, user_id)
    return {"produced": produced, "created": created, "cancelled": cancelled, "expired": expired}


async def list_validation_reminders(
    deps: EngagementDeps,
    user_id: str,
) -> list[dict[str, str | None]]:
    """In-app only helper: the reminders of one learner, oldest first."""
    async with deps.db.service_tx() as tx:
        rows = await queries.list_validation_reminders(tx, user_id)
    return [{"id": row.id, "dedupeKey": row.dedupe_key} for row in rows]


def reminder_key_of(slot_id: str, starts_at: datetime) -> str:
    """The stable key of a slot, exposed for the integration tests (ET-4)."""
    return reminder_key(slot_id, starts_at)


def next_reminder_instant(starts_at: datetime | str) -> datetime:
    """The reminder instant of a slot, exposed for the integration tests (CA-2)."""
    instant = parse_iso(starts_at) if isinstance(starts_at, str) else starts_at
    return reminder_at(instant)


def quiz_link(formation_id: str | None, module_id: str | None) -> str:
    """The deep link of the quiz, exposed for the tests."""
    return quiz_href(formation_id, module_id)


__all__ = [
    "list_validation_reminders",
    "next_reminder_instant",
    "profile_timezone",
    "prune_validation_quiz_reminders",
    "quiz_link",
    "reminder_key_of",
    "schedule_validation_quiz_reminder",
    "sync_validation_quiz_reminders",
]
