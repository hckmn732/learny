"""Dependency bundle of the learning use cases in the integration suite (SPEC-2202).

The suite runs against the shared local stack inside a service transaction that `rolled_back`
always reverts. The use cases open their own user transaction (RLS) and, for the system-managed
writes such as the milestones, a service transaction: both reuse that same connection through
savepoints, exactly like `identity_support.SavepointTransactions` does for identity.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import structlog
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Tx
from sqlalchemy import text

from factories.identity_support import FIXED, SavepointTransactions

SET_NO_CLAIMS = text(
    "select set_config('request.jwt.claims', '{}', true), set_config('request.jwt.claim.sub', '', true)"
)


class LearningTransactions(SavepointTransactions):
    """`user_tx` as identity defines it, plus the service transaction the milestones need."""

    def __init__(self, tx: Tx) -> None:
        super().__init__(tx)
        self._service_counter = 0

    @asynccontextmanager
    async def service_tx(self) -> AsyncIterator[Tx]:
        self._service_counter += 1
        name = f"learning_service_{self._service_counter}"
        conn = self._tx.conn
        await conn.execute(text(f"savepoint {name}"))
        # A service transaction has no JWT claims, so `auth.uid()` is null instead of the previous
        # learner (production opens a fresh connection).
        await conn.execute(text("reset role"))
        await conn.execute(SET_NO_CLAIMS)
        try:
            yield Tx(conn=conn, actor=None)
        except Exception:
            with suppress(Exception):
                await conn.execute(text(f"rollback to savepoint {name}"))
            raise
        await conn.execute(text(f"release savepoint {name}"))


@dataclass
class LearningTestDeps:
    """The dependency bundle the learning use cases see; a `Deps` satisfies the same protocol."""

    settings: Settings
    clock: FixedClock
    db: LearningTransactions
    logger: Any


def learning_deps(tx: Tx, *, now: datetime = FIXED) -> LearningTestDeps:
    """Builds the stand-in bundle around an already open seed transaction."""
    return LearningTestDeps(
        settings=Settings(),
        clock=FixedClock(now),
        db=LearningTransactions(tx),
        logger=structlog.get_logger("learny.test"),
    )
