"""State rules of the personal-data exports (SPEC-211 EF-1, EF-2, EF-8, CL-2, CL-4, ADR-0044).

Port of `export.ts` constants and of the pure `isDataExportDownloadable` rule
(`packages/db/src/schema/privacy-search.ts`). The archive of a learner is downloadable only while it
is `done`, stored and not expired; an expired archive stays readable for audit but never issues a
signed URL, and it is purged only after a one-day grace period.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

ExportStatus = Literal["queued", "running", "done", "failed"]

EXPORT_STATUSES: tuple[str, ...] = ("queued", "running", "done", "failed")

# Three exports per local civil day (EF-1) and a seven-day archive (CL-4).
EXPORT_DAILY_LIMIT = 3
EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000

# An archive is removed once its expiration is older than this grace period (EF-8).
EXPORT_PURGE_GRACE_MS = 24 * 60 * 60 * 1000

# A job still running after fifteen minutes is `failed` without an e-mail (EF-4).
EXPORT_JOB_TIMEOUT_MS = 15 * 60 * 1000


@dataclass(frozen=True, slots=True)
class DownloadableExport:
    """The three fields the downloadability rule reads (the row of `data_exports`)."""

    status: str
    storage_path: str | None
    expires_at: datetime | None


def can_download(record: DownloadableExport, now: datetime) -> bool:
    """`isDataExportDownloadable`: `done`, stored and strictly unexpired (CL-2)."""
    return (
        record.status == "done"
        and record.storage_path is not None
        and record.storage_path != ""
        and record.expires_at is not None
        and record.expires_at > now
    )


def is_expired(record: DownloadableExport, now: datetime) -> bool:
    """CL-4 - a `done` archive whose expiration passed answers 410, never a signed URL."""
    return record.status == "done" and not can_download(record, now)


def expires_at_of(now: datetime) -> datetime:
    """Expiration of an archive created now (seven days, ADR-0044)."""
    return now + timedelta(milliseconds=EXPORT_TTL_MS)


def purge_cutoff(now: datetime) -> datetime:
    """EF-8 - exports expired before this instant are removed."""
    return now - timedelta(milliseconds=EXPORT_PURGE_GRACE_MS)


def is_purgeable(expires_at: datetime | None, now: datetime) -> bool:
    """EF-8 - an expiration older than the grace period, and nothing else."""
    return expires_at is not None and expires_at < purge_cutoff(now)


def reached_daily_limit(used_today: int) -> bool:
    """EF-1, CL-2 - the fourth request of the local day is refused."""
    return used_today >= EXPORT_DAILY_LIMIT


def job_timed_out(started_at: datetime, now: datetime) -> bool:
    """EF-4 - a job that started more than fifteen minutes ago fails without an e-mail."""
    return now - started_at >= timedelta(milliseconds=EXPORT_JOB_TIMEOUT_MS)


@dataclass(frozen=True, slots=True)
class ExportAccepted:
    """First answer of `POST /api/v1/me/export` (202): the job identifier and its state."""

    export_id: str
    status: ExportStatus
