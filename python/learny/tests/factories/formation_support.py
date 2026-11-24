"""Test support of the formation use cases (SPEC-2201).

The integration suite runs against the shared local stack: every test seeds rows with the owner role
inside a service transaction that `rolled_back` always reverts. The formation use cases also need a
service transaction of their own (outbox metadata, invitations), which reuses that same connection
inside a savepoint, and the deterministic mock gateway of `learny.platform.llm`.
"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import structlog
from learny.engagement.infrastructure.email import MemoryEmailTransport
from learny.engagement.infrastructure.push import MockPushTransport
from learny.platform.llm.gateway import MockGateway
from learny.platform.llm.mock import load_registry
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Tx
from sqlalchemy import text

from factories.engagement_deps import email_config
from factories.identity_support import FIXED, SavepointTransactions


class FormationTransactions(SavepointTransactions):
    """`user_tx` as identity defines it, plus the service transaction formation needs."""

    def __init__(self, tx: Tx) -> None:
        super().__init__(tx)
        self._service_counter = 0

    @asynccontextmanager
    async def service_tx(self) -> AsyncIterator[Tx]:
        self._service_counter += 1
        name = f"formation_service_{self._service_counter}"
        conn = self._tx.conn
        await conn.execute(text(f"savepoint {name}"))
        # A service transaction has no JWT claims, so a security-definer function sees `null`
        # instead of the previous learner (production opens a fresh connection).
        await conn.execute(text("reset role"))
        await conn.execute(
            text(
                "select set_config('request.jwt.claims', '{}', true), "
                "set_config('request.jwt.claim.sub', '', true)"
            )
        )
        try:
            yield Tx(conn=conn, actor=None)
        except Exception:
            with suppress(Exception):
                await conn.execute(text(f"rollback to savepoint {name}"))
            raise
        await conn.execute(text(f"release savepoint {name}"))


class FakeStorage:
    """A Storage gateway that only signs deterministic URLs (SPEC-4001 upload sources)."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    async def sign_upload(
        self, bucket: str, path: str, access_token: str, expires_in_seconds: int
    ) -> str:
        self.calls.append((bucket, path))
        return f"https://storage.test/{bucket}/{path}"

    async def sign_read(
        self, bucket: str, path: str, access_token: str, expires_in_seconds: int
    ) -> str:
        return f"https://storage.test/{bucket}/{path}"

    async def remove(self, bucket: str, path: str, access_token: str) -> None:
        return None

    async def list(self, bucket: str, path: str, access_token: str) -> list[Any]:
        return []


@dataclass
class FormationTestDeps:
    """The dependency bundle the formation use cases see; a `Deps` satisfies the same protocol."""

    settings: Settings
    clock: FixedClock
    db: FormationTransactions
    llm: MockGateway
    logger: Any
    storage: FakeStorage
    email_config: Any
    email: MemoryEmailTransport
    push: MockPushTransport


def formation_deps(tx: Tx, *, now: datetime = FIXED) -> FormationTestDeps:
    """Builds the stand-in bundle around an already open seed transaction."""
    return FormationTestDeps(
        settings=Settings(supabase_jwt_secret=("test" + "-storage-signing-material")),
        clock=FixedClock(now),
        db=FormationTransactions(tx),
        llm=MockGateway(load_registry()),
        logger=structlog.get_logger("learny.test"),
        storage=FakeStorage(),
        email_config=email_config(),
        email=MemoryEmailTransport(FixedClock(now)),
        push=MockPushTransport(FixedClock(now).now),
    )


async def create_message(
    conn: Any,
    formation_id: str,
    user_id: str,
    *,
    role: str,
    content: str,
    question_key: str | None = None,
    suggestions: list[dict[str, Any]] | None = None,
    position: int = 1,
) -> str:
    """One scoping message, stored exactly like `persistTutorTurn` stores it."""
    result = await conn.execute(
        text(
            """
            insert into public.cadrage_messages (
              formation_id, user_id, role, content, question_key, suggestions, position, created_at
            )
            values (
              cast(:formation as uuid), cast(:user as uuid), cast(:role as public.message_role),
              :content, cast(:key as public.cadrage_key), cast(:suggestions as jsonb), :position,
              cast(:now as timestamptz)
            )
            returning id::text as id
            """
        ),
        {
            "formation": formation_id,
            "user": user_id,
            "role": role,
            "content": content,
            "key": question_key,
            "suggestions": None if suggestions is None else json.dumps(suggestions, ensure_ascii=False),
            "position": position,
            "now": FIXED,
        },
    )
    return str(result.mappings().all()[0]["id"])
