"""Hourly purge of the expired security rows (SPEC-208 EF-7, ADR-0258).

Port of `packages/services/src/security/purge.ts` and of the `security-purge` function: the
idempotency keys created more than 24 hours ago and the rate-limit buckets untouched for 24 hours
are deleted. The comparison is strict, so a key of 23 h 59 min is kept and a key of 24 h + 1 s is
deleted. The `cron/hourly-tick` identifier is the idempotency key of the consumer: a replayed tick
purges once.
"""

from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any, Protocol

from sqlalchemy import text

SECURITY_RETENTION = timedelta(hours=24)
"""EF-7 - one day covers every replay window of the HTTP pipeline."""

DELETE_EXPIRED_IDEMPOTENCY_KEYS = text(
    """
    delete from public.idempotency_keys
    where created_at < cast(:before as timestamptz)
    returning key
    """
)
DELETE_STALE_RATE_LIMITS = text(
    """
    delete from public.rate_limits
    where updated_at < cast(:before as timestamptz)
    returning bucket
    """
)


class SecurityPurgeDeps(Protocol):
    """What the purge needs; `learny.shared.deps.Deps` satisfies it."""

    @property
    def clock(self) -> Any: ...

    @property
    def db(self) -> Any: ...

    @property
    def logger(self) -> Any: ...


def retention_limit(now: datetime) -> datetime:
    """Strictly older than 24 h is removed (`purgeSecurityRows`)."""
    return now - SECURITY_RETENTION


async def purge_rows_in_tx(tx: Any, now: datetime) -> dict[str, int]:
    """The two deletions inside an existing transaction (the demonstration owns its rows)."""
    before = retention_limit(now)
    keys = len((await tx.conn.execute(DELETE_EXPIRED_IDEMPOTENCY_KEYS, {"before": before})).mappings().all())
    buckets = len((await tx.conn.execute(DELETE_STALE_RATE_LIMITS, {"before": before})).mappings().all())
    return {"idempotencyKeys": keys, "rateLimitBuckets": buckets}


async def purge_security_rows(deps: SecurityPurgeDeps) -> dict[str, int]:
    """Deletes both families of expired rows and returns their counts."""
    async with deps.db.service_tx() as tx:
        removed = await purge_rows_in_tx(tx, deps.clock.now())
    deps.logger.info(
        "security purge completed",
        outcome=f"idempotency_keys={removed['idempotencyKeys']} buckets={removed['rateLimitBuckets']}",
    )
    return removed


def outcome_of(removed: Mapping[str, int]) -> Mapping[str, int]:
    """The result the `security-purge` consumer returns (`{idempotencyKeys, rateLimitBuckets}`)."""
    return {
        "idempotencyKeys": int(removed["idempotencyKeys"]),
        "rateLimitBuckets": int(removed["rateLimitBuckets"]),
    }


__all__ = [
    "DELETE_EXPIRED_IDEMPOTENCY_KEYS",
    "DELETE_STALE_RATE_LIMITS",
    "SECURITY_RETENTION",
    "SecurityPurgeDeps",
    "outcome_of",
    "purge_security_rows",
    "retention_limit",
]
