"""Nightly purge of the offline synchronisation receipts (SPEC-801 ET-6, ADR-0200).

Port of `packages/db/src/repositories/offline-receipts.ts` (`purgeOfflineReceipts`) and of the
`offline-receipts-purge` function: the receipts created more than 30 days ago are deleted. The
comparison is strict and the instant comes from the injected clock, so a replay of the same tick
purges nothing twice.
"""

from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any, Protocol

from sqlalchemy import text

OFFLINE_RECEIPT_RETENTION_DAYS = 30
"""ET-6 - a receipt only serves the resynchronisation of one month."""

DELETE_OLD_RECEIPTS = text(
    """
    delete from public.offline_sync_receipts
    where created_at < cast(:before as timestamptz)
    returning client_id::text as client_id
    """
)


class OfflineReceiptPurgeDeps(Protocol):
    """What the purge needs; `learny.shared.deps.Deps` satisfies it."""

    @property
    def clock(self) -> Any: ...

    @property
    def db(self) -> Any: ...

    @property
    def logger(self) -> Any: ...


def retention_limit(now: datetime, days: int = OFFLINE_RECEIPT_RETENTION_DAYS) -> datetime:
    """The instant before which a receipt is deleted."""
    return now - timedelta(days=days)


async def purge_offline_receipts(
    deps: OfflineReceiptPurgeDeps, *, days: int = OFFLINE_RECEIPT_RETENTION_DAYS
) -> int:
    """Deletes the receipts older than `days` and returns how many rows went away."""
    before = retention_limit(deps.clock.now(), days)
    async with deps.db.service_tx() as tx:
        deleted = len((await tx.conn.execute(DELETE_OLD_RECEIPTS, {"before": before})).mappings().all())
    deps.logger.info("offline receipts purge completed", outcome=f"deleted={deleted}")
    return deleted


def outcome_of(deleted: int) -> Mapping[str, int]:
    """The result the `offline-receipts-purge` consumer returns (`{deleted}`)."""
    return {"deleted": deleted}


__all__ = [
    "DELETE_OLD_RECEIPTS",
    "OFFLINE_RECEIPT_RETENTION_DAYS",
    "OfflineReceiptPurgeDeps",
    "outcome_of",
    "purge_offline_receipts",
    "retention_limit",
]
