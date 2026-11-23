"""Development demonstrations of SPEC-203: the outbox pipeline and the hourly tick.

The start emits `sdd/demo-requested` in the caller's transaction so the worker pipeline runs for
real; the run reads its state; the tick previews the local windows of the factory users (address
prefix `sdd-203-`) and the outbox returns the counts of the caller's own events.
"""

from datetime import datetime
from typing import Any

from learny.engagement.public import build_local_tick, tick_instant
from learny.shared.errors import AppError
from learny.shared.ids import new_id
from learny.shared.locale_fr.details import UNAUTHENTICATED
from learny.shared.time import (
    local_hour,
    local_minute_of_day,
    parse_iso,
    to_epoch_ms,
    to_iso,
)
from sqlalchemy import text

from learny_api.pipeline import Call

DEMO_EVENT = "sdd/demo-requested"
SDD_203_USER_PREFIX = "sdd-203-"
PAGE_SIZE = 500

SELECT_RUN = text(
    "select run_id::text as run_id, steps, attempts, finished_at "
    "from public.sdd_demo_runs where run_id = cast(:run_id as uuid)"
)
# `selectTickUsers` with the factory prefix of the demonstration: an
# active learner only, and never one whose account deletion is scheduled at the tick instant.
SELECT_TICK_USERS = text(
    """
    select p.id::text as id, p.timezone
    from public.profiles p
    where p.email like :prefix
      and p.onboarding_step in ('rappels', 'depart', 'done')
      and (p.deletion_scheduled_for is null or p.deletion_scheduled_for > cast(:tick as timestamptz))
      and p.id::text > :after
    order by p.id::text
    limit :limit
    """
)
COUNT_OUTBOX = text(
    """
    select count(*) filter (
               where sent_at is null and dispatched_at is null and not failed
           )::int as pending,
           count(*) filter (where sent_at is not null or dispatched_at is not null)::int as sent,
           count(*) filter (where failed)::int as failed
    from public.event_outbox where user_id = cast(:user_id as uuid)
    """
)


async def start(call: Call) -> dict[str, Any]:
    """`startDemoPipeline`: one durable event in the caller's transaction (ET-7)."""
    body: Any = call.body
    if call.actor is None or call.user_id is None:
        raise AppError("UNAUTHENTICATED", UNAUTHENTICATED)
    run_id = new_id()
    async with call.deps.db.user_tx(call.actor) as tx:
        await tx.emit(
            DEMO_EVENT,
            {"runId": run_id, "failOnceAt": body.failOnceAt},
            event_id=f"sdd-demo:{run_id}",
            user_id=call.user_id,
        )
    return {"jobId": run_id}


async def run(call: Call) -> dict[str, Any]:
    """`getDemoRun`: the state of one run; a pipeline that has not started reads as empty."""
    params: Any = call.params
    run_id = str(params.runId)
    async with call.deps.db.service_tx() as tx:
        row = (await tx.conn.execute(SELECT_RUN, {"run_id": run_id})).mappings().first()
    if row is None:
        return {"runId": run_id, "steps": [], "attempts": 0, "finishedAt": None}
    return {
        "runId": str(row["run_id"]),
        "steps": list(row["steps"]),
        "attempts": int(row["attempts"]),
        "finishedAt": None if row["finished_at"] is None else to_iso(row["finished_at"]),
    }


async def tick(call: Call) -> dict[str, Any]:
    """`previewHourlyTick`: the local windows the hourly tick would select at `at`."""
    body: Any = call.body
    at = getattr(body, "at", None)
    instant: datetime = parse_iso(str(at)) if at is not None else call.deps.clock.now()
    tick_at = tick_instant(instant)
    users: list[dict[str, Any]] = []
    cursor = ""
    while True:
        async with call.deps.db.service_tx() as tx:
            rows = (
                (
                    await tx.conn.execute(
                        SELECT_TICK_USERS,
                        {
                            "prefix": f"{SDD_203_USER_PREFIX}%",
                            "tick": to_iso(tick_at),
                            "after": cursor,
                            "limit": PAGE_SIZE,
                        },
                    )
                )
                .mappings()
                .all()
            )
        for row in rows:
            local = build_local_tick(str(row["id"]), str(row["timezone"]), tick_at)
            if local is None:
                continue
            milliseconds = to_epoch_ms(local.window_start)
            hour = local_hour(milliseconds, local.timezone)
            minute = local_minute_of_day(milliseconds, local.timezone) % 60
            users.append(
                {
                    "userId": local.user_id,
                    "timezone": local.timezone,
                    "windowStart": to_iso(local.window_start),
                    "windowEnd": to_iso(local.window_end),
                    "localDate": local.local_date,
                    "localWeekday": local.local_weekday,
                    "localStart": f"{hour:02d}:{minute:02d}",
                }
            )
        if len(rows) < PAGE_SIZE:
            break
        cursor = str(rows[-1]["id"])
    return {"tickAt": to_iso(tick_at), "users": users}


async def outbox(call: Call) -> dict[str, Any]:
    """`getOutboxCounts`: pending, sent and failed events of the caller's own rows."""
    if call.user_id is None:
        raise AppError("UNAUTHENTICATED", UNAUTHENTICATED)
    async with call.deps.db.service_tx() as tx:
        row = (await tx.conn.execute(COUNT_OUTBOX, {"user_id": call.user_id})).mappings().first()
    if row is None:
        return {"pending": 0, "sent": 0, "failed": 0}
    return {"pending": int(row["pending"]), "sent": int(row["sent"]), "failed": int(row["failed"])}
