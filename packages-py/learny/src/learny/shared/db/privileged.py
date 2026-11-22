"""Closed list of the callers allowed to bypass row-level security (SPEC-2101 EF-4, CA-3).

A service transaction uses the owner role, so a module that opens one sees every row. The list is
the only place where that is allowed; `tests/unit/shared/test_privileged_callers.py` scans the
source and fails on any `service_tx(` call made from a module that is not listed here. Start the
list from the TypeScript `serviceDb()` call sites and add a line only with a written reason.
"""

from types import MappingProxyType
from typing import Final

PRIVILEGED_CALLERS: Final = MappingProxyType(
    {
        # The unit of work itself defines `service_tx`; it holds no business call.
        "learny.shared.db.uow": "defines the service transaction",
        # `rate_limits` has no policy for learners (SPEC-208 ET-4).
        "learny_api.guards.rate_limit": "token buckets of the request pipeline",
        # `idempotency_keys` is a service-only table (SPEC-112 EF-3, ADR-0120).
        "learny_api.guards.idempotency": "idempotency reservations and replays",
        # The smoothing journal of the daily quiz is an automation proposal (SPEC-718 ET-4).
        "learny.learning.application.review": "quiz smoothing automation journal row",
        # Storage objects and export archives are signed or written with the service role.
        "learny.platform.storage": "signed URLs and export objects",
        # Admin Auth calls (user creation, deletion) need the service role key.
        "learny.identity.infrastructure.gotrue": "GoTrue admin endpoints",
        # SPEC-2201 - outbox metadata of the cadrage conclusion (ADR-0246)
        "learny.formation.application.cadrage": "outbox metadata of the cadrage conclusion (ADR-0246)",
        # SPEC-2201 - transition events written after the status change
        "learny.formation.application.formations": "transition events written after the status change",
        # SPEC-2201 - invitee has no membership yet (ADR-0246) and member events
        "learny.formation.application.groups": "invitee has no membership yet (ADR-0246) and member events",
        # SPEC-2201 - failed import and adjustment reasons, programme events
        "learny.formation.application.programme": "failed import and adjustment reasons, programme events",
        # SPEC-2202 - milestones are system-managed and read-only for the authenticated role
        "learny.learning.application.series": "milestone rows are read-only for the authenticated role",
        "learny.learning.application.final_review": "skips the reminders of a stopped interview (ADR-0112)",
        "learny.learning.application.planning": "automation journal of the lightening proposal (BR-AUT-11)",
        # SPEC-2202 - the owner of a session read with the service role answers FORBIDDEN (ET-7).
        "learny.assessments.application.offline_sync": "owner probe of an offline session (ET-7)",
        # The worker owns the outbox tables: fanned-out deliveries, claims and completion.
        "learny_worker.dispatcher": "outbox fan-out into job deliveries",
        "learny_worker.runner": "claims, completion and backoff of the deliveries",
        "learny_worker.scheduler": "cron ticks written to the outbox",
        "learny_worker.health": "readiness probe of the worker",
    }
)
