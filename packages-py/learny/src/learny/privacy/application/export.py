"""Self-service export (SPEC-211 EF-1, EF-2, ET-1, ET-3, CL-1, CL-2, CL-5; ADR-0044).

Port of `packages/services/src/personal-data/export.ts`. The creation runs in one transaction with
the outbox: a learner never ends up with a queued row and no event. The three-exports-a-day limit
uses the learner's local civil day, and a job already queued or running is returned as is (double
click: one job, one e-mail). Reads and the signed URL go through the owner's row-level security;
another learner's identifier is a plain 404.
"""

from typing import Any

from learny.identity.domain.actor import Actor
from learny.platform.storage import SIGNED_URL_TTL_SECONDS, mint_user_access_token
from learny.privacy.application.ports import PrivacyDeps
from learny.privacy.domain.exports import (
    DownloadableExport,
    can_download,
    is_expired,
    reached_daily_limit,
)
from learny.privacy.infrastructure import queries
from learny.shared.errors import AppError
from learny.shared.locale_fr import privacy as fr
from learny.shared.time import to_epoch_ms, to_iso, user_local_day


def _require_user(actor: Actor | None) -> str:
    if actor is None or actor.user_id == "":
        raise AppError("UNAUTHENTICATED", fr.UNAUTHENTICATED)
    return actor.user_id


async def _signed_url(deps: PrivacyDeps, user_id: str, path: str | None) -> str:
    if path is None:
        raise AppError("NOT_FOUND", fr.EXPORT_NOT_FOUND)
    token = mint_user_access_token(user_id, deps.settings.supabase_jwt_secret, deps.clock)
    return await deps.storage.sign_read("exports", path, token, SIGNED_URL_TTL_SECONDS)


def _view(row: queries.DataExportRow, download_url: str | None = None) -> dict[str, Any]:
    view: dict[str, Any] = {
        "id": row.id,
        "status": row.status,
        "sizeBytes": row.size_bytes,
        "createdAt": to_iso(row.created_at),
        "expiresAt": None if row.expires_at is None else to_iso(row.expires_at),
    }
    if download_url is not None:
        view["downloadUrl"] = download_url
    return view


async def request_export(deps: PrivacyDeps, actor: Actor | None) -> dict[str, Any]:
    """EF-1, CL-1 - creates at most one queued export per learner and enqueues its job."""
    user_id = _require_user(actor)
    async with deps.db.service_tx() as tx:
        timezone = await queries.profile_timezone(tx, user_id)
    if timezone is None:
        raise AppError("NOT_FOUND", fr.PROFILE_NOT_FOUND)
    today = user_local_day(to_epoch_ms(deps.clock.now()), timezone)
    async with deps.db.service_tx() as tx:
        await queries.lock_daily_quota(tx, user_id)
        pending = await queries.find_pending_export(tx, user_id)
        if pending is not None:
            return {"exportId": pending.id, "status": pending.status}
        used = await queries.count_exports_on(tx, user_id, today)
        if reached_daily_limit(used):
            raise AppError("EXPORT_LIMIT_REACHED", fr.EXPORT_LIMIT_MESSAGE)
        row = await queries.create_export(tx, user_id, today, deps.clock.now())
        await tx.emit(
            "account/export-requested",
            {"userId": user_id, "exportId": row.id},
            event_id=f"account-export:{row.id}",
            user_id=user_id,
        )
        return {"exportId": row.id, "status": "queued"}


async def get_export(deps: PrivacyDeps, actor: Actor | None, export_id: str) -> dict[str, Any]:
    """EF-2, CL-4, CL-5 - owner-only state; a done and unexpired export gets a fresh URL."""
    user_id = _require_user(actor)
    async with deps.db.user_tx(actor) as tx:  # type: ignore[arg-type]
        row = await queries.get_export(tx, user_id, export_id)
    if row is None:
        raise AppError("NOT_FOUND", fr.EXPORT_NOT_FOUND)
    record = DownloadableExport(status=row.status, storage_path=row.storage_path, expires_at=row.expires_at)
    if is_expired(record, deps.clock.now()):
        raise AppError("EXPORT_EXPIRED", fr.EXPORT_EXPIRED_MESSAGE)
    if not can_download(record, deps.clock.now()):
        return _view(row)
    return _view(row, await _signed_url(deps, user_id, row.storage_path))


async def download_export(deps: PrivacyDeps, actor: Actor | None, export_id: str) -> dict[str, str]:
    """EF-2, CL-4 - `?download=1`: a fresh signed URL, or 410 once the archive expired."""
    user_id = _require_user(actor)
    async with deps.db.user_tx(actor) as tx:  # type: ignore[arg-type]
        row = await queries.get_export(tx, user_id, export_id)
    if row is None:
        raise AppError("NOT_FOUND", fr.EXPORT_NOT_FOUND)
    record = DownloadableExport(status=row.status, storage_path=row.storage_path, expires_at=row.expires_at)
    now = deps.clock.now()
    if is_expired(record, now):
        raise AppError("EXPORT_EXPIRED", fr.EXPORT_EXPIRED_MESSAGE)
    if not can_download(record, now):
        raise AppError("NOT_FOUND", fr.EXPORT_NOT_FOUND)
    return {"url": await _signed_url(deps, user_id, row.storage_path)}
