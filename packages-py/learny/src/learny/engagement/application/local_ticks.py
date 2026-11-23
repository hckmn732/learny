"""Hourly local-tick fan-out of the scheduler (SPEC-2207, from `packages/jobs/src/tick.ts`).

The hourly task of the worker emits one `user/local-tick` per active learner: `[T - 5 min,
T + 55 min[` in the zone of the profile, with the same payload and the same event identifier as the
`cron-hourly-tick` function. The selection, the window and the identifier stay in this context, so
the worker never writes SQL (00-conventions section 2). The event has no Python consumer yet (the
plan P22 lists none): it is emitted for parity with the TypeScript cron.
"""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.tick import (
    TICK_PAGE_SIZE,
    LocalTick,
    build_local_tick,
    tick_instant,
)
from learny.engagement.infrastructure import queries
from learny.shared.time import to_iso

LOCAL_TICK_EVENT = "user/local-tick"


def local_tick_payload(tick: LocalTick) -> dict[str, Any]:
    """`buildLocalTick`: the exact payload of the `user/local-tick` contract."""
    return {
        "userId": tick.user_id,
        "timezone": tick.timezone,
        "windowStart": to_iso(tick.window_start),
        "windowEnd": to_iso(tick.window_end),
        "localDate": tick.local_date,
        "localWeekday": tick.local_weekday,
    }


def local_tick_event_id(payload: Mapping[str, Any]) -> str:
    """`localTickEventId`: one identifier per learner and window (CL-7)."""
    return f"local-tick:{payload['userId']}:{payload['windowStart']}"


async def local_tick_page(
    deps: EngagementDeps,
    tick: datetime,
    after: str | None = None,
    limit: int = TICK_PAGE_SIZE,
) -> dict[str, Any]:
    """One page of the fan-out: `{events, after, size}`.

    `events` holds the payloads of the learners whose stored zone is usable, `after` the cursor of
    the next page (the last identifier read, even when its zone was skipped, so a page always
    advances) and `size` the number of rows selected.
    """
    instant = tick_instant(tick)
    async with deps.db.service_tx() as tx:
        users = await queries.select_tick_users(tx, instant, after, limit)
    events: list[dict[str, Any]] = []
    skipped = 0
    for user in users:
        local = build_local_tick(user.user_id, user.timezone, instant)
        if local is None:
            skipped += 1
            continue
        events.append(local_tick_payload(local))
    if skipped:
        deps.logger.warning(
            "local tick skipped: invalid time zone",
            outcome="invalid_timezone",
            count=skipped,
        )
    return {
        "events": events,
        "after": users[-1].user_id if users else None,
        "size": len(users),
    }


__all__ = [
    "LOCAL_TICK_EVENT",
    "local_tick_event_id",
    "local_tick_page",
    "local_tick_payload",
]
