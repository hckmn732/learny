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
        # Storage objects and export archives are signed or written with the service role.
        "learny.platform.storage": "signed URLs and export objects",
        # Admin Auth calls (user creation, deletion) need the service role key.
        "learny.identity.infrastructure.gotrue": "GoTrue admin endpoints",
    }
)
