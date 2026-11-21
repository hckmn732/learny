"""Unit of work and RLS claims (SPEC-2101 step 1, ADR-2010).

A transaction is bound to one connection. For a user transaction the Supabase JWT claims are set
locally, so the row-level security policies see the same `auth.uid()` as the TypeScript backend,
then the connection switches to the `authenticated` role. A service transaction keeps the owner
role and bypasses RLS; its callers are restricted by `privileged.PRIVILEGED_CALLERS`.
"""

import hashlib
import json
import uuid
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from learny.identity.domain.actor import Actor
from learny.shared.config import Settings
from learny.shared.db.engine import create_engine
from learny.shared.jsonx import canonical

SET_CLAIMS = text(
    "select set_config('request.jwt.claims', :claims, true), set_config('request.jwt.claim.sub', :sub, true)"
)
ENQUEUE_EVENT = text(
    "select public.enqueue_event("
    "cast(:event_id as text), cast(:name as text), cast(:data as jsonb), cast(:user_id as uuid))"
)


def claims_json(actor: Actor) -> str:
    """Serialises the Supabase JWT claims like `buildUserClaims` (`packages/db/src/client.ts`)."""
    claims = {
        "sub": actor.user_id,
        "role": "authenticated",
        "aud": "authenticated",
        "email": actor.email,
    }
    return json.dumps(claims, ensure_ascii=False, separators=(",", ":"))


def event_id_for(name: str, data: Mapping[str, Any]) -> str:
    """`<name>:sha256(canonical(data))[:32]` ... identical across runtimes (00-conventions section 7)."""
    digest = hashlib.sha256(canonical(dict(data))).hexdigest()[:32]
    return f"{name}:{digest}"


def _assert_user_id(user_id: str) -> None:
    """Rejects a malformed identifier before opening a connection (like `assertUser`)."""
    try:
        uuid.UUID(user_id)
    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError(f"invalid user identifier: {user_id!r}") from error


@dataclass
class Tx:
    """One transaction: SQL execution plus the outbox events written in it."""

    conn: AsyncConnection
    actor: Actor | None
    events: list[str] = field(default_factory=list)

    async def emit(
        self,
        name: str,
        data: Mapping[str, Any],
        *,
        event_id: str | None = None,
        user_id: str | None = None,
    ) -> str:
        """Writes one outbox event through `public.enqueue_event` and returns its identifier."""
        identifier = event_id if event_id is not None else event_id_for(name, data)
        owner = user_id if user_id is not None else (self.actor.user_id if self.actor else None)
        await self.conn.execute(
            ENQUEUE_EVENT,
            {
                "event_id": identifier,
                "name": name,
                "data": json.dumps(dict(data), ensure_ascii=False),
                "user_id": owner,
            },
        )
        self.events.append(identifier)
        return identifier

    async def set_local(self, setting: str, value: str) -> None:
        """Sets a transaction-local GUC (`learny.actor`, `hnsw.ef_search`...)."""
        await self.conn.execute(
            text("select set_config(:name, :value, true)"),
            {"name": setting, "value": value},
        )


class Database:
    """Owns the engine and hands out user or service transactions."""

    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    @classmethod
    def from_settings(cls, settings: Settings) -> "Database":
        return cls(create_engine(settings))

    @asynccontextmanager
    async def user_tx(self, actor: Actor) -> AsyncIterator[Tx]:
        """Transaction under the caller's identity: RLS applies."""
        _assert_user_id(actor.user_id)
        async with self._engine.begin() as connection:
            await connection.execute(
                SET_CLAIMS,
                {"claims": claims_json(actor), "sub": actor.user_id},
            )
            await connection.execute(text("set local role authenticated"))
            yield Tx(conn=connection, actor=actor)

    @asynccontextmanager
    async def service_tx(self) -> AsyncIterator[Tx]:
        """Transaction as the owner role, bypassing RLS (restricted callers)."""
        async with self._engine.begin() as connection:
            yield Tx(conn=connection, actor=None)

    @property
    def engine(self) -> AsyncEngine:
        """The engine, for the dedicated connection of the scheduler advisory lock."""
        return self._engine

    async def close(self) -> None:
        await self._engine.dispose()
