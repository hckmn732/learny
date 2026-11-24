"""Dependency bundle of the engagement use cases in the integration suite (SPEC-2205).

The suite runs against the shared local stack inside a service transaction that `rolled_back`
always reverts. The use cases open their own user transaction (RLS) and, for the notification
producer, a service transaction: both reuse that same connection through savepoints, exactly like
`learning_deps.LearningTransactions`. The e-mail channel captures in memory and the push channel is
mocked, so no test ever touches the network (`EMAIL_MODE=memory`, `PUSH_MODE=mock`).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import structlog
from learny.engagement.infrastructure.email import (
    DEFAULT_EMAIL_FROM,
    EmailConfig,
    MemoryEmailTransport,
)
from learny.engagement.infrastructure.push import MockPushTransport
from learny.platform.llm.gateway import MockGateway
from learny.platform.llm.mock import load_registry
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Tx
from sqlalchemy import text

from factories.identity_support import FIXED, SavepointTransactions

SET_NO_CLAIMS = text(
    "select set_config('request.jwt.claims', '{}', true), set_config('request.jwt.claim.sub', '', true)"
)

EMAIL_LINK_SECRET = "learny-test-only-email-link-secret-00000000"
APP_URL = "http://localhost:3100"


class EngagementTransactions(SavepointTransactions):
    """`user_tx` as identity defines it, plus the service transaction the producer needs."""

    def __init__(self, tx: Tx) -> None:
        super().__init__(tx)
        self._service_counter = 0

    @asynccontextmanager
    async def service_tx(self) -> AsyncIterator[Tx]:
        self._service_counter += 1
        name = f"engagement_service_{self._service_counter}"
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
class EngagementTestDeps:
    """The dependency bundle the engagement use cases see; a `Deps` satisfies the same protocol."""

    settings: Settings
    clock: FixedClock
    db: EngagementTransactions
    logger: Any
    email_config: EmailConfig
    email: MemoryEmailTransport
    push: MockPushTransport
    llm: MockGateway


def email_config() -> EmailConfig:
    """The `memory` channel of the suite: the same shape as the production configuration."""
    return EmailConfig(
        mode="memory",
        sender=DEFAULT_EMAIL_FROM,
        app_url=APP_URL,
        link_secret=EMAIL_LINK_SECRET,
        smtp_host="127.0.0.1",
        smtp_port=1025,
        resend_api_key=None,
        is_production=False,
    )


def engagement_deps(tx: Tx, *, now: datetime = FIXED) -> EngagementTestDeps:
    """Builds the stand-in bundle around an already open seed transaction."""
    clock = FixedClock(now)
    return EngagementTestDeps(
        settings=Settings(),
        clock=clock,
        db=EngagementTransactions(tx),
        logger=structlog.get_logger("learny.test"),
        email_config=email_config(),
        email=MemoryEmailTransport(clock),
        push=MockPushTransport(clock.now),
        llm=MockGateway(load_registry()),
    )


__all__ = [
    "APP_URL",
    "EMAIL_LINK_SECRET",
    "EngagementTestDeps",
    "EngagementTransactions",
    "email_config",
    "engagement_deps",
]
