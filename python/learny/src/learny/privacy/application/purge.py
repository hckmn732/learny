"""Nightly purge of expired personal-data exports (SPEC-211 EF-8).

An archive is removed from the private bucket once its expiration is older than 24 hours; the row
goes with it. A missing blob counts as removed (idempotent step), and a page opened after the
expiration but before the purge still answers 410.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from learny.platform.storage import StorageBucket
from learny.privacy.application.ports import PrivacyDeps
from learny.privacy.domain.exports import purge_cutoff
from learny.privacy.infrastructure import queries

RemoveObject = Callable[[StorageBucket, str], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class PurgeDeps:
    """Storage port of the purge; the integration suite injects an in-memory one."""

    remove_object: RemoveObject


@dataclass(frozen=True, slots=True)
class PurgeOutcome:
    """How many rows and objects the purge removed."""

    rows: int
    objects: int


async def purge_exports(deps: PrivacyDeps, purge: PurgeDeps | None = None, limit: int = 200) -> PurgeOutcome:
    """EF-8 - removed once the expiration is older than the one-day grace period."""
    ports = purge if purge is not None else await _default_ports(deps)
    before = purge_cutoff(deps.clock.now())
    async with deps.db.service_tx() as tx:
        expired = await queries.list_expired_exports(tx, before, limit)
    objects = 0
    for row in expired:
        if row.storage_path is not None and row.storage_path != "":
            await ports.remove_object("exports", row.storage_path)
            objects += 1
        async with deps.db.service_tx() as tx:
            await queries.delete_export(tx, row.user_id, row.id)
    return PurgeOutcome(rows=len(expired), objects=objects)


async def _default_ports(deps: PrivacyDeps) -> PurgeDeps:
    from learny.privacy.infrastructure.job_storage import default_remove_object

    return PurgeDeps(remove_object=default_remove_object(deps))
