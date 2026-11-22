"""SQL of the privacy context (SPEC-2206, port of the Drizzle queries of `personal-data/`).

The statements are the TypeScript ones: same `order by`, same `for update`, same advisory lock for
the daily quota. The account page reads an export under the owner's RLS (`get_data_export`), while
the creation and the deletion schedule run with the owner role, exactly like the TypeScript
`serviceDb()` calls they replace.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx

PROFILE_TIMEZONE = text("select timezone from public.profiles where id = cast(:user_id as uuid)")
PROFILE_DELETION = text(
    "select id::text as id, email, timezone, deletion_requested_at, deletion_scheduled_for "
    "from public.profiles where id = cast(:user_id as uuid) for update"
)
INSERT_EXPORT = text(
    "insert into public.data_exports (user_id, status, requested_on, created_at) "
    "values (cast(:user_id as uuid), :status, cast(:requested_on as date), :created_at) "
    "returning id::text as id, user_id::text as user_id, status::text as status, storage_path, "
    "expires_at, size_bytes, error, requested_on::text as requested_on, created_at"
)
FIND_PENDING = text(
    "select id::text as id, user_id::text as user_id, status::text as status, storage_path, "
    "expires_at, size_bytes, error, requested_on::text as requested_on, created_at "
    "from public.data_exports "
    "where user_id = cast(:user_id as uuid) and status in ('queued', 'running') "
    "order by created_at desc, id desc limit 1"
)
COUNT_ON = text(
    "select count(*)::int as count from public.data_exports "
    "where user_id = cast(:user_id as uuid) and requested_on = cast(:requested_on as date)"
)
GET_EXPORT = text(
    "select id::text as id, user_id::text as user_id, status::text as status, storage_path, "
    "expires_at, size_bytes, error, requested_on::text as requested_on, created_at "
    "from public.data_exports "
    "where id = cast(:export_id as uuid) and user_id = cast(:user_id as uuid)"
)
SCHEDULE_DELETION = text(
    "update public.profiles set deletion_requested_at = :now, deletion_scheduled_for = :scheduled, "
    "updated_at = :now where id = cast(:user_id as uuid) and deletion_scheduled_for is null"
)
CANCEL_DELETION = text(
    "update public.profiles set deletion_requested_at = null, deletion_scheduled_for = null, "
    "updated_at = :now where id = cast(:user_id as uuid)"
)
ADVISORY_LOCK = text("select pg_advisory_xact_lock(hashtext(:user_id)::bigint)")


@dataclass(frozen=True, slots=True)
class DataExportRow:
    """One row of `data_exports` (data-model section 11)."""

    id: str
    user_id: str
    status: str
    storage_path: str | None
    expires_at: datetime | None
    size_bytes: int | None
    error: str | None
    requested_on: str | None
    created_at: datetime


@dataclass(frozen=True, slots=True)
class ProfileDeletionRow:
    """The profile fields the deletion need (EF-5, EF-6)."""

    id: str
    email: str
    timezone: str
    deletion_requested_at: datetime | None
    deletion_scheduled_for: datetime | None


def export_row(record: Any) -> DataExportRow:
    data = dict(record._mapping)
    return DataExportRow(
        id=str(data["id"]),
        user_id=str(data["user_id"]),
        status=str(data["status"]),
        storage_path=data["storage_path"],
        expires_at=data["expires_at"],
        size_bytes=None if data["size_bytes"] is None else int(data["size_bytes"]),
        error=data["error"],
        requested_on=data["requested_on"],
        created_at=data["created_at"],
    )


async def profile_timezone(tx: Tx, user_id: str) -> str | None:
    """`profileZone`: the time zone of the local civil day of the quota (EF-1)."""
    result = await tx.conn.execute(PROFILE_TIMEZONE, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else found[0]["timezone"]


async def lock_profile_for_deletion(tx: Tx, user_id: str) -> ProfileDeletionRow | None:
    """`select ... for update` of the deletion capture (EF-5, EF-7)."""
    result = await tx.conn.execute(PROFILE_DELETION, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        return None
    data = dict(found[0])
    return ProfileDeletionRow(
        id=str(data["id"]),
        email=str(data["email"]),
        timezone=str(data["timezone"] or "Europe/Paris"),
        deletion_requested_at=data["deletion_requested_at"],
        deletion_scheduled_for=data["deletion_scheduled_for"],
    )


async def lock_daily_quota(tx: Tx, user_id: str) -> None:
    """`pg_advisory_xact_lock(hashtext(userId))`: one job at a time per learner (CL-1)."""
    await tx.conn.execute(ADVISORY_LOCK, {"user_id": user_id})


async def find_pending_export(tx: Tx, user_id: str) -> DataExportRow | None:
    """The export still being produced, if any (one job at a time, CL-1)."""
    result = await tx.conn.execute(FIND_PENDING, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else export_row(found[0])


async def count_exports_on(tx: Tx, user_id: str, requested_on: str) -> int:
    """Exports of the owner created on one local civil day (EF-1)."""
    result = await tx.conn.execute(COUNT_ON, {"user_id": user_id, "requested_on": requested_on})
    return int(result.mappings().all()[0]["count"])


async def create_export(tx: Tx, user_id: str, requested_on: str, created_at: datetime) -> DataExportRow:
    """Creates the private export job of one learner (EF-1)."""
    result = await tx.conn.execute(
        INSERT_EXPORT,
        {
            "user_id": user_id,
            "status": "queued",
            "requested_on": requested_on,
            "created_at": created_at,
        },
    )
    found = result.mappings().all()
    return export_row(found[0])


async def get_export(tx: Tx, user_id: str, export_id: str) -> DataExportRow | None:
    """One export of the owner; another learner's identifier yields `None` under RLS (CL-5)."""
    result = await tx.conn.execute(GET_EXPORT, {"user_id": user_id, "export_id": export_id})
    found = result.mappings().all()
    return None if not found else export_row(found[0])


async def schedule_deletion(tx: Tx, user_id: str, now: datetime, scheduled_for: datetime) -> bool:
    """EF-5 - sets both columns once; a replay finds the deadline already set."""
    result = await tx.conn.execute(
        SCHEDULE_DELETION, {"user_id": user_id, "now": now, "scheduled": scheduled_for}
    )
    return result.rowcount > 0


async def cancel_deletion(tx: Tx, user_id: str, now: datetime) -> None:
    """EF-6 - clears both columns; without a pending request it still succeeds."""
    await tx.conn.execute(CANCEL_DELETION, {"user_id": user_id, "now": now})
