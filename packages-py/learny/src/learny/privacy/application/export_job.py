"""Personal-data export job (SPEC-211 EF-1 to EF-4, ET-2, ET-6, CL-1, CL-6, ADR-0216).

Port of `packages/jobs/src/functions/data-export.ts`. Five durable steps: `load`, `collect` (under
RLS), `zip` (streamed to a temporary file), `upload` (upsert, so a crash at this step leaves exactly
one final object) and `finalize` (fifteen-minute bound, expiration, e-mail, in-app notification). The
job is idempotent on `exportId`: a replay of a finished export returns its stored result.
"""

import tempfile
import zipfile
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, cast

from learny.engagement import public as engagement
from learny.platform.storage import StorageBucket, export_path
from learny.privacy.application.collect import CollectedExport, collect_export_data
from learny.privacy.application.ports import PrivacyDeps
from learny.privacy.domain.archive import ArchiveEntry, format_long_date, format_size_label
from learny.privacy.domain.exports import (
    expires_at_of,
    job_timed_out,
)
from learny.privacy.infrastructure import queries
from learny.shared.errors import AppError
from learny.shared.locale_fr import privacy as fr
from learny.shared.time import to_iso

EXPORT_BUCKET: StorageBucket = "exports"
TIMEOUT_CODE = "export_timeout"
MAX_OBJECT_BYTES = 64 * 1024 * 1024

ReadObject = Callable[[str], Awaitable[bytes | None]]
UploadArchive = Callable[[StorageBucket, str, Path], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class ExportJobDeps:
    """Storage ports of the export job; the integration suite injects in-memory ones."""

    read_object: ReadObject
    upload_archive: UploadArchive


@dataclass(frozen=True, slots=True)
class ExportJobOutcome:
    """Result of one run of the job."""

    status: str
    export_id: str
    entries: list[str]
    size_bytes: int | None
    expires_at: str | None
    error: str | None


def _bounded_error(error: BaseException) -> str:
    message = f"{type(error).__name__}: {error}"
    return " ".join(message.split())[:2000]


async def write_archive(entries: list[ArchiveEntry], read_object: ReadObject, now: datetime) -> Path:
    """Writes the entries to a fresh temporary ZIP file (bounded memory, EF-3)."""
    directory = Path(tempfile.mkdtemp(prefix="learny-export-"))
    archive_path = directory / "export.zip"
    stamp = (
        now.year,
        now.month,
        now.day,
        now.hour,
        now.minute,
        now.second,
    )
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for entry in entries:
            info = zipfile.ZipInfo(filename=entry.name, date_time=stamp)
            info.compress_type = zipfile.ZIP_DEFLATED
            if entry.text is not None:
                archive.writestr(info, entry.text)
                continue
            if entry.storage_path is None:
                continue
            content = await read_object(entry.storage_path)
            # A blob removed between the collection and the zip is skipped (CL-3).
            if content is None:
                continue
            archive.writestr(info, content)
    return archive_path


def _remove_archive(path: Path) -> None:
    import shutil

    shutil.rmtree(path.parent, ignore_errors=True)


async def _mark_failed(deps: PrivacyDeps, export_id: str, error: BaseException) -> None:
    async with deps.db.service_tx() as tx:
        row = await queries.load_export(tx, export_id)
        if row is not None and row.status == "done":
            return
        await queries.fail_export(tx, export_id, _bounded_error(error))


async def run_data_export(
    deps: PrivacyDeps,
    user_id: str,
    export_id: str,
    job: ExportJobDeps | None = None,
) -> ExportJobOutcome:
    """Runs the five steps on one export; a replay of a finished job returns its stored result."""
    ports = job if job is not None else await _default_ports(deps)
    try:
        async with deps.db.service_tx() as tx:
            row = await queries.load_export(tx, export_id)
            if row is None or row.user_id != user_id:
                return ExportJobOutcome("skipped", export_id, [], None, None, fr.EXPORT_JOB_MISSING)
            if row.status == "done" and row.storage_path is not None and row.size_bytes is not None:
                return ExportJobOutcome(
                    "done",
                    export_id,
                    [],
                    row.size_bytes,
                    None if row.expires_at is None else to_iso(row.expires_at),
                    None,
                )
            await queries.start_export(tx, export_id)
            profile = await queries.profile_for_job(tx, user_id)
        if profile is None:
            raise AppError("NOT_FOUND", fr.PROFILE_NOT_FOUND)

        collected: CollectedExport = await collect_export_data(deps, user_id, deps.clock.now())
        archive_path = await write_archive(collected.entries, ports.read_object, deps.clock.now())
        size_bytes = archive_path.stat().st_size
        storage_path = export_path(user_id, export_id)
        await ports.upload_archive(EXPORT_BUCKET, storage_path, archive_path)
        _remove_archive(archive_path)
        deps.logger.info("export archive uploaded", exportId=export_id, outcome=f"size={size_bytes}")

        now = deps.clock.now()
        if job_timed_out(row.created_at, now):
            error = AppError("INTERNAL_ERROR", fr.EXPORT_TIMEOUT)
            await _mark_failed(deps, export_id, error)
            raise AppError("SERVICE_UNAVAILABLE", fr.EXPORT_TIMEOUT, reason=TIMEOUT_CODE)

        expires_at = expires_at_of(now)
        async with deps.db.service_tx() as tx:
            completed = await queries.complete_export(
                tx, user_id, export_id, storage_path, size_bytes, expires_at
            )
        if not completed:
            raise AppError("NOT_FOUND", fr.EXPORT_NOT_FOUND)

        size_label = format_size_label(size_bytes)
        expires_label = format_long_date(expires_at, collected.timezone)
        tone = str(profile.get("tutor_tone") or "vous")
        await engagement.send_email(
            cast(Any, deps),
            user_id=user_id,
            template=fr.EXPORT_READY_TEMPLATE,
            props={
                "downloadUrl": f"{_app_url(deps)}/api/v1/me/exports/{export_id}?download=1",
                "sizeLabel": size_label,
                "expiresLabel": expires_label,
            },
            idempotency_key=f"export:{export_id}",
            tone_override="tu" if tone == "tu" else None,
        )
        await engagement.notify(
            cast(Any, deps),
            user_id=user_id,
            notification_type=fr.EXPORT_READY_TEMPLATE,
            data={"days": 7, "href": fr.PROFILE_PATH},
            dedupe_key=f"export:{export_id}",
        )
        return ExportJobOutcome(
            "done",
            export_id,
            [entry.name for entry in collected.entries],
            size_bytes,
            to_iso(expires_at),
            None,
        )
    except AppError as error:
        if error.extra.get("reason") != TIMEOUT_CODE:
            await _mark_failed(deps, export_id, error)
        raise
    except Exception as error:  # a failed job keeps its row for audit (EF-4)
        await _mark_failed(deps, export_id, error)
        raise


def _app_url(deps: PrivacyDeps) -> str:
    return str(deps.email_config.app_url).rstrip("/")


async def _default_ports(deps: PrivacyDeps) -> ExportJobDeps:
    """Production ports: the private buckets, read and written with the service role."""
    from learny.privacy.infrastructure.job_storage import default_export_ports

    return default_export_ports(deps)
