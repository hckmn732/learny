"""Durable submission of a mock exam at its deadline (SPEC-614 EF-2, ET-4, ADR-0172 section 3b).

The `exam/started` event schedules the run at `deadlineAt + 5 s` (the network tolerance that
replaces `step.sleepUntil`), then the exam service submits and grades the attempt once. The service
checks the deadline again (`trigger='deadline'`), so an early execution - a replayed delivery, a
clock skew - never ends the exam before its time.

The state guard is the attempt status: `submit_exam` returns the restored outcome without writing
when the attempt is no longer `in_progress`, which makes a duplicated delivery harmless.
"""

from collections.abc import Mapping
from datetime import datetime, timedelta
from typing import Any

from learny.assessments.application.exam_attempts import EXAM_GRACE_SECONDS, exam_expired, submit_exam
from learny.assessments.application.ports import AssessmentDeps
from learny.identity.domain.actor import Actor
from learny.shared.time import parse_iso

EXAM_DEADLINE_JOB = "exam-deadline"
EXAM_DEADLINE_GRACE_MS = EXAM_GRACE_SECONDS * 1000
"""ADR-0172 section 3b - the five-second network tolerance granted after the server deadline."""


def submit_at_of(deadline_at: str | datetime) -> datetime:
    """The instant the automatic submission runs: `deadlineAt + 5 s`."""
    deadline = deadline_at if isinstance(deadline_at, datetime) else parse_iso(deadline_at)
    return deadline + timedelta(milliseconds=EXAM_DEADLINE_GRACE_MS)


def run_at(event: Any, clock: Any) -> datetime | None:
    """`run_at` of the consumer: the deadline plus the grace, never in the past."""
    data = getattr(event, "data", None)
    if not isinstance(data, Mapping):
        return None
    deadline_at = data.get("deadlineAt")
    if not isinstance(deadline_at, str):
        return None
    target = submit_at_of(deadline_at)
    now = clock.now()
    return target if target > now else now


def deadline_reached(deadline_at: str | datetime, now: datetime) -> bool:
    """The service submits only once the deadline plus the grace has passed (`examExpired`)."""
    deadline = deadline_at if isinstance(deadline_at, datetime) else parse_iso(deadline_at)
    return exam_expired(deadline, now)


async def submit_exam_at_deadline(
    deps: AssessmentDeps,
    user_id: str,
    attempt_id: str,
) -> dict[str, Any]:
    """Submits and grades the attempt of the event, with the `deadline` trigger."""
    actor = Actor(user_id=user_id, email="", email_confirmed=True, transport="bearer")
    return await submit_exam(deps, actor, attempt_id, trigger="deadline")


__all__ = [
    "EXAM_DEADLINE_GRACE_MS",
    "EXAM_DEADLINE_JOB",
    "deadline_reached",
    "run_at",
    "submit_at_of",
    "submit_exam_at_deadline",
]
