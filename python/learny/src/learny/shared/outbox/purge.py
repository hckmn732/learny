"""Nightly cleanup of the delivered outbox rows (SPEC-203 ET-6, ADR-0122).

The rows delivered more than seven days ago are deleted. `job_deliveries` cascades on the foreign
key (`on delete cascade`), so no delivery outlives its event. The retention instant comes from the
injected clock, and the purge is idempotent: a replay of the same nightly tick deletes nothing.

The worker stamps `dispatched_at` instead of `sent_at` (SPEC-2102): a row counts as delivered when
either instant is older than the retention, which keeps the purge effective after the cutover while
still ignoring the rows that were never dispatched.
"""

from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any, Protocol

from sqlalchemy import text

OUTBOX_RETENTION_DAYS = 7
"""ADR-0122 - a delivered event is kept long enough to replay one nightly diagnosis."""

DELETE_DELIVERED = text(
    """
    delete from public.event_outbox
    where coalesce(sent_at, dispatched_at) < cast(:before as timestamptz)
    returning id
    """
)


class OutboxPurgeDeps(Protocol):
    """What the purge needs; `learny.shared.deps.Deps` satisfies it."""

    @property
    def clock(self) -> Any: ...

    @property
    def db(self) -> Any: ...

    @property
    def logger(self) -> Any: ...


def retention_limit(now: datetime, days: int = OUTBOX_RETENTION_DAYS) -> datetime:
    """The instant before which a delivered row is deleted."""
    return now - timedelta(days=days)


async def purge_outbox(deps: OutboxPurgeDeps, *, days: int = OUTBOX_RETENTION_DAYS) -> int:
    """Deletes the delivered rows older than `days` and returns how many rows went away."""
    before = retention_limit(deps.clock.now(), days)
    async with deps.db.service_tx() as tx:
        deleted = len((await tx.conn.execute(DELETE_DELIVERED, {"before": before})).mappings().all())
    deps.logger.info("outbox cleanup completed", outcome=f"deleted={deleted}")
    return deleted


def outcome_of(deleted: int) -> Mapping[str, int]:
    """The result the `nightly-outbox-cleanup` consumer returns (`{deleted}`)."""
    return {"deleted": deleted}


__all__ = [
    "DELETE_DELIVERED",
    "OUTBOX_RETENTION_DAYS",
    "OutboxPurgeDeps",
    "outcome_of",
    "purge_outbox",
    "retention_limit",
]
