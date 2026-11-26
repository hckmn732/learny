"""SQL of the outbox fan-out and of the leased deliveries (SPEC-2102 plan, steps 3 and 4).

Every statement runs on the owner role, inside one service transaction per batch. `run_after` is
compared with the injected clock, while leases and `dispatched_at` use the database clock: a test
with a frozen clock can then claim, expire a lease and re-claim deterministically.
"""

import math
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.shared.outbox.events import Delivery, Event

# One transaction, one statement: take up to `:limit` undispatched events without contending with a
# second worker (`skip locked`), and stamp them. History is never replayed (`dispatched_at` backfill).
DISPATCH_BATCH = text(
    """
    with batch as (
      select id from public.event_outbox
      where dispatched_at is null
      order by created_at
      limit :limit
      for update skip locked
    )
    update public.event_outbox o
    set dispatched_at = now()
    from batch
    where o.id = batch.id
    returning o.event_id, o.name, o.data, o.user_id, o.created_at
    """
)
# `JOBS_MODE=inline`: the same stamp, restricted to the events one request committed.
DISPATCH_EVENTS = text(
    """
    with batch as (
      select id from public.event_outbox
      where dispatched_at is null and event_id = any(cast(:event_ids as text[]))
      order by created_at
      for update skip locked
    )
    update public.event_outbox o
    set dispatched_at = now()
    from batch
    where o.id = batch.id
    returning o.event_id, o.name, o.data, o.user_id, o.created_at
    """
)
INSERT_DELIVERY = text(
    """
    insert into public.job_deliveries (event_id, consumer, run_after)
    values (:event_id, :consumer, cast(:run_after as timestamptz))
    on conflict (event_id, consumer) do nothing
    """
)
INSERT_FAILED_DELIVERY = text(
    """
    insert into public.job_deliveries
      (event_id, consumer, status, last_error, run_after, completed_at)
    values (:event_id, :consumer, 'failed', :error, now(), now())
    on conflict (event_id, consumer) do nothing
    """
)
# A delivery is claimable when it is due, or when its lease expired because the worker died.
CLAIM = text(
    """
    update public.job_deliveries d
    set status = 'running', attempts = d.attempts + 1,
        locked_until = now() + make_interval(secs => :lease_s)
    from public.event_outbox o
    where o.event_id = d.event_id
      and (d.event_id, d.consumer) in (
        select event_id, consumer from public.job_deliveries
        where (status = 'pending' and run_after <= cast(:now as timestamptz))
           or (status = 'running' and locked_until < now())
        order by run_after
        limit :free_slots
        for update skip locked
      )
    returning d.event_id, d.consumer, d.attempts, o.name, o.data, o.user_id, o.created_at
    """
)
# `JOBS_MODE=inline`: the pending deliveries of the given events, whatever their `run_after` (the
# inline mode ignores the delays,).
CLAIM_EVENTS = text(
    """
    update public.job_deliveries d
    set status = 'running', attempts = d.attempts + 1,
        locked_until = now() + make_interval(secs => :lease_s)
    from public.event_outbox o
    where o.event_id = d.event_id
      and (d.event_id, d.consumer) in (
        select event_id, consumer from public.job_deliveries
        where status = 'pending' and event_id = any(cast(:event_ids as text[]))
          and not (consumer = any(cast(:exclude as text[])))
        order by run_after
        for update skip locked
      )
    returning d.event_id, d.consumer, d.attempts, o.name, o.data, o.user_id, o.created_at
    """
)
# `JOBS_MODE=inline`: events still waiting for a dispatcher, or deliveries still pending/running.
UNSETTLED = text(
    """
    select
      (select count(*) from public.event_outbox
        where dispatched_at is null and event_id = any(cast(:event_ids as text[])))
      + (select count(*) from public.job_deliveries
        where status in ('pending', 'running') and event_id = any(cast(:event_ids as text[]))
          and not (consumer = any(cast(:exclude as text[]))))
      as total
    """
)
COMPLETE = text(
    """
    update public.job_deliveries
    set status = 'done', completed_at = now(), locked_until = null, last_error = null
    where event_id = :event_id and consumer = :consumer
    """
)
RESCHEDULE = text(
    """
    update public.job_deliveries
    set status = 'pending', locked_until = null, last_error = :error,
        run_after = cast(:run_after as timestamptz)
    where event_id = :event_id and consumer = :consumer
    """
)
FAIL = text(
    """
    update public.job_deliveries
    set status = 'failed', completed_at = now(), locked_until = null, last_error = :error
    where event_id = :event_id and consumer = :consumer
    """
)
# ET-2: one cheap query for the leader's `worker.stats` line.
STATS = text(
    """
    select
      coalesce(max(extract(epoch from (now() - run_after))) filter (where status = 'pending'), 0)
        ::int as oldest_pending_seconds,
      count(*) filter (where status = 'running')::int as running,
      count(*) filter (where status = 'failed' and completed_at > now() - interval '1 hour')::int
        as failed_last_hour
    from public.job_deliveries
    """
)
LAST_ERROR_MAX = 300


def backoff_seconds(attempts: int) -> int:
    """`min(10 s * 2^(n-1), 1 h)`: the delay before the next attempt after `n` failures."""
    return int(min(10 * math.pow(2, max(1, attempts) - 1), 3600))


def _event(row: Any) -> Event:
    return Event(
        event_id=str(row["event_id"]),
        name=str(row["name"]),
        data=dict(row["data"]),
        user_id=str(row["user_id"]) if row["user_id"] is not None else None,
        created_at=row["created_at"],
    )


def _bounded(message: str) -> str:
    return message[:LAST_ERROR_MAX]


async def take_batch(tx: Any, limit: int) -> list[Event]:
    """Stamps and returns up to `limit` undispatched events (one statement)."""
    rows = (await tx.conn.execute(DISPATCH_BATCH, {"limit": limit})).mappings().all()
    return [_event(row) for row in rows]


async def take_events(tx: Any, event_ids: list[str]) -> list[Event]:
    """Stamps and returns the given events when no dispatcher took them yet (inline mode)."""
    if not event_ids:
        return []
    rows = (await tx.conn.execute(DISPATCH_EVENTS, {"event_ids": event_ids})).mappings().all()
    return [_event(row) for row in rows]


async def schedule_delivery(
    tx: Any,
    event: Event,
    consumer: str,
    run_after: datetime,
) -> None:
    await tx.conn.execute(
        INSERT_DELIVERY,
        {"event_id": event.event_id, "consumer": consumer, "run_after": run_after},
    )


async def schedule_failed_delivery(tx: Any, event: Event, consumer: str, error: str) -> None:
    """A payload the consumer rejects is never retried."""
    await tx.conn.execute(
        INSERT_FAILED_DELIVERY,
        {"event_id": event.event_id, "consumer": consumer, "error": _bounded(error)},
    )


@dataclass(frozen=True, slots=True)
class ClaimedDelivery:
    """A claimed delivery together with the event it belongs to."""

    delivery: Delivery
    event: Event


async def claim(
    tx: Any,
    now: datetime,
    lease_seconds: int,
    free_slots: int,
) -> list[ClaimedDelivery]:
    """Claims due or expired deliveries; `skip locked` keeps two workers apart (CL-2)."""
    if free_slots <= 0:
        return []
    rows = (
        (
            await tx.conn.execute(
                CLAIM,
                {"now": now, "lease_s": lease_seconds, "free_slots": free_slots},
            )
        )
        .mappings()
        .all()
    )
    return _claimed(rows)


async def claim_events(
    tx: Any,
    event_ids: list[str],
    lease_seconds: int,
    exclude: tuple[str, ...] = (),
) -> list[ClaimedDelivery]:
    """Claims the pending deliveries of the given events, due or not (inline mode)."""
    if not event_ids:
        return []
    rows = (
        (
            await tx.conn.execute(
                CLAIM_EVENTS,
                {"event_ids": event_ids, "lease_s": lease_seconds, "exclude": list(exclude)},
            )
        )
        .mappings()
        .all()
    )
    return _claimed(rows)


def _claimed(rows: Any) -> list[ClaimedDelivery]:
    claimed: list[ClaimedDelivery] = []
    for row in rows:
        claimed.append(
            ClaimedDelivery(
                delivery=Delivery(
                    event_id=str(row["event_id"]),
                    consumer=str(row["consumer"]),
                    attempts=int(row["attempts"]),
                ),
                event=_event(row),
            )
        )
    return claimed


async def unsettled(tx: Any, event_ids: list[str], exclude: tuple[str, ...] = ()) -> int:
    """How many of the given events or of their deliveries are not finished yet (inline mode)."""
    row = (
        (await tx.conn.execute(UNSETTLED, {"event_ids": event_ids, "exclude": list(exclude)}))
        .mappings()
        .first()
    )
    return int(row["total"]) if row is not None else 0


async def complete(tx: Any, delivery: Delivery) -> None:
    await tx.conn.execute(COMPLETE, {"event_id": delivery.event_id, "consumer": delivery.consumer})


# A worker that restarts (a deployment stops the previous one mid-job) takes back the deliveries left
# `running`, instead of waiting for their lease, up to the consumer timeout (QA 2026-11-26).
RELEASE_RUNNING = text(
    """
    update public.job_deliveries
    set locked_until = now()
    where status = 'running' and locked_until > now()
    """
)


async def release_running(tx: Any) -> int:
    """Makes every `running` delivery claimable again; returns how many."""
    result = await tx.conn.execute(RELEASE_RUNNING)
    return int(getattr(result, "rowcount", 0) or 0)


async def reschedule(tx: Any, delivery: Delivery, run_after: datetime, error: str) -> None:
    await tx.conn.execute(
        RESCHEDULE,
        {
            "event_id": delivery.event_id,
            "consumer": delivery.consumer,
            "run_after": run_after,
            "error": _bounded(error),
        },
    )


async def fail(tx: Any, delivery: Delivery, error: str) -> None:
    await tx.conn.execute(
        FAIL,
        {"event_id": delivery.event_id, "consumer": delivery.consumer, "error": _bounded(error)},
    )


async def stats(tx: Any) -> Mapping[str, int]:
    row = (await tx.conn.execute(STATS)).mappings().all()[0]
    return {
        "oldestPendingSeconds": int(row["oldest_pending_seconds"]),
        "running": int(row["running"]),
        "failedLastHour": int(row["failed_last_hour"]),
    }
