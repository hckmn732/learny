"""Deletion schedule of an account (SPEC-211 EF-5, EF-6, EF-7; BR-ACC-11).

Port of the pure constants of `personal-data/deletion.ts` and `jobs/src/functions/account-deletion.ts`:
the request schedules the effective deletion thirty days later, a replay returns the same deadline,
the nightly job only picks the profiles that are due (oldest first, fifty per run), and a cancelled
request deletes nothing.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from learny.shared.errors import AppError
from learny.shared.locale_fr import privacy as fr

DELETION_DELAY_DAYS = 30
DELETION_DELAY_MS = DELETION_DELAY_DAYS * 24 * 60 * 60 * 1000

# `DELETION_BATCH` of the nightly function: fifty due profiles per run.
DELETION_BATCH = 50


def scheduled_instant(now: datetime) -> datetime:
    """EF-5 - the deadline of a request made at `now` (J+30)."""
    return now + timedelta(milliseconds=DELETION_DELAY_MS)


def is_due(scheduled_for: datetime | None, now: datetime) -> bool:
    """EF-7 - a profile is due when its deadline is set and reached."""
    return scheduled_for is not None and scheduled_for <= now


def is_scheduled(scheduled_for: datetime | None) -> bool:
    """EF-5 - a replay returns the stored deadline until it is cancelled."""
    return scheduled_for is not None


def assert_system_user(context_user_id: str | None, user_id: str) -> None:
    """`assertSystemUser`: the system context never deletes another learner by accident."""
    if context_user_id is not None and context_user_id != user_id:
        raise AppError("FORBIDDEN", fr.ACCOUNT_INCONSISTENT)


@dataclass(frozen=True, slots=True)
class DeletionState:
    """Answer of `POST /api/v1/me/deletion`: the deadline, ISO-8601 with milliseconds."""

    scheduled_for: str
