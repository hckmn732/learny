"""Daily digest of the learner (SPEC-2205, from `packages/notifications/src/digest.ts`).

`plan_daily_digests` is the planning half of the `notifications-daily-digest` job: it selects the
active learners whose `digest_time` falls in the local window of the tick and returns the instant at
which each digest is due. `send_daily_digest` is the sending half: it reads the local day's agenda
and the capped notifications of the previous day, then delegates the write to `notify`, whose dedupe
key `digest:<user>:<day>` makes a replay create nothing (CA-4, ADR-0123).
"""

from datetime import datetime
from typing import Any

from learny.engagement.application.notify import notify
from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.digest import (
    DIGEST_ACTIVITY_LIMIT,
    DIGEST_HELD_LIMIT,
    DIGEST_HREF,
    activity_of,
    date_label,
    global_quiz_of,
    held_max_per_day,
    planned_label,
    previous_civil_day,
    slot_minutes,
)
from learny.engagement.domain.tick import (
    TICK_PAGE_SIZE,
    build_local_tick,
    digest_time_of,
    due_in_window,
)
from learny.engagement.infrastructure import queries
from learny.shared.time import (
    end_of_user_day,
    from_epoch_ms,
    start_of_user_day,
    to_epoch_ms,
    to_iso,
    user_local_day,
)


async def build_digest_data(
    deps: EngagementDeps,
    user_id: str,
    day: str,
    time_zone: str,
) -> dict[str, Any]:
    """Reads the local day's schedule and the capped notifications of the previous local day."""
    start_ms = start_of_user_day(day, time_zone)
    end_ms = end_of_user_day(day, time_zone)
    previous_day = previous_civil_day(day)
    previous_start_ms = start_of_user_day(previous_day, time_zone)
    async with deps.db.service_tx() as tx:
        slots = await queries.list_digest_slots(
            tx,
            user_id=user_id,
            day_start=from_epoch_ms(start_ms),
            day_end=from_epoch_ms(end_ms),
        )
        capped = await queries.list_capped_notifications(
            tx,
            user_id=user_id,
            day_start=from_epoch_ms(previous_start_ms),
            day_end=from_epoch_ms(start_ms),
        )
        settings = await queries.select_settings(tx, user_id)

    minutes = sum(slot_minutes(row.starts_at, row.ends_at) for row in slots)
    held: dict[str, Any] | None = None
    if capped:
        held = {
            "count": len(capped),
            "maxPerDay": held_max_per_day(None if settings is None else settings.max_per_day),
            "titles": [row.title for row in capped[:DIGEST_HELD_LIMIT]],
        }
    return {
        "dateLabel": date_label(from_epoch_ms(start_ms), time_zone),
        "plannedLabel": planned_label(minutes, len(slots)),
        "activityCount": len(slots),
        "activities": [activity_of(row, time_zone) for row in slots[:DIGEST_ACTIVITY_LIMIT]],
        "globalQuiz": global_quiz_of(slots),
        "held": held,
    }


async def send_daily_digest(
    deps: EngagementDeps,
    *,
    user_id: str,
    at: datetime,
    time_zone: str,
) -> dict[str, Any]:
    """EF-6, ET-6 - creates the digest of one learner for one local day, idempotently."""
    day = user_local_day(to_epoch_ms(at), time_zone)
    async with deps.db.service_tx() as tx:
        profile = await queries.read_profile(tx, user_id)
    if profile is None:
        return {"notificationId": None, "created": False, "heldCount": 0}
    data = await build_digest_data(deps, user_id, day, str(profile["timezone"]))
    result = await notify(
        deps,
        user_id=user_id,
        notification_type="daily_digest",
        data={**data, "href": DIGEST_HREF, "formationTitle": None},
        dedupe_key=f"digest:{user_id}:{day}",
        eligible_at=to_iso(at),
    )
    held = data["held"]
    return {
        "notificationId": result["notificationId"],
        "created": result["created"],
        "heldCount": 0 if held is None else int(held["count"]),
    }


async def send_daily_digest_at(
    deps: EngagementDeps,
    *,
    user_id: str,
    at: datetime,
) -> dict[str, Any]:
    """Job entry point of `job/daily-digest`: the profile zone is read here, then sent once.

    ADR-2014 - the planning half emits this internal event instead of sleeping inside one function;
    the payload carries `{userId, at}` only, so the zone comes from the profile. A profile deleted
    between the plan and the send has nothing to notify: the job succeeds without a notification,
    like `sendDailyDigest` when the profile is gone.
    """
    async with deps.db.service_tx() as tx:
        time_zone = await queries.read_profile_timezone(tx, user_id)
    if time_zone is None:
        return {"notificationId": None, "created": False, "heldCount": 0}
    return await send_daily_digest(deps, user_id=user_id, at=at, time_zone=time_zone)


async def plan_daily_digests(deps: EngagementDeps, tick: datetime) -> list[dict[str, str]]:
    """The planning half of the job: the learners due in the window, and their instant."""
    plans: list[dict[str, str]] = []
    cursor: str | None = None
    while True:
        async with deps.db.service_tx() as tx:
            users = await queries.select_tick_users(tx, tick, cursor, TICK_PAGE_SIZE)
        if not users:
            break
        for user in users:
            async with deps.db.service_tx() as tx:
                settings = await queries.select_settings(tx, user.user_id)
            if settings is None:
                continue
            local = build_local_tick(user.user_id, user.timezone, tick)
            if local is None:
                continue
            due = due_in_window(digest_time_of(settings.digest_time), local)
            if due is None:
                continue
            plans.append(
                {
                    "userId": user.user_id,
                    "at": to_iso(due),
                    "timeZone": user.timezone,
                }
            )
        cursor = users[-1].user_id
        if len(users) < TICK_PAGE_SIZE:
            break
    return plans


async def held_block(
    deps: EngagementDeps,
    *,
    user_id: str,
    day: str,
    time_zone: str,
    max_per_day: int,
) -> dict[str, Any]:
    """EF-6 - the capped notifications of the previous day, as the demonstration shows them."""
    start_ms = start_of_user_day(day, time_zone)
    previous_start_ms = start_of_user_day(previous_civil_day(day), time_zone)
    async with deps.db.service_tx() as tx:
        rows = await queries.list_capped_notifications(
            tx,
            user_id=user_id,
            day_start=from_epoch_ms(previous_start_ms),
            day_end=from_epoch_ms(start_ms),
        )
    return {
        "count": len(rows),
        "maxPerDay": held_max_per_day(max_per_day),
        "titles": [row.title for row in rows[:DIGEST_HELD_LIMIT]],
    }


__all__ = [
    "build_digest_data",
    "held_block",
    "plan_daily_digests",
    "send_daily_digest",
    "send_daily_digest_at",
]
