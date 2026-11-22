"""Shared helpers of the development demonstrations (SPEC-2207)."""

import json
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

from learny.engagement import public as engagement
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.time import to_iso
from sqlalchemy import text

INSERT_AUTH_USER = text(
    "insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, "
    "raw_app_meta_data, created_at, updated_at) values (gen_random_uuid(), "
    "'00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', :email, "
    "cast(:metadata as jsonb), cast(:app_metadata as jsonb), now(), now()) "
    "returning id::text as id"
)
DELETE_AUTH_USER = text("delete from auth.users where email = :email")


def emails_for(deps: Any, to: str | None) -> list[dict[str, str]]:
    """`emailsFor`: the messages the memory transport captured for one recipient."""
    items = engagement.list_demo_outbox(deps)["items"]
    return [
        {"template": item["template"] or "email", "to": item["to"], "at": item["at"]}
        for item in items
        if to is None or item["to"] == to
    ]


def demo_email(instant: datetime, prefix: str) -> str:
    """`demoEmail`: a recognisable address stamped with the fixed clock of the request."""
    stamp = to_iso(instant).replace(":", "-").replace(".", "-")
    return f"{prefix}-{stamp}@test.learny.test"


async def new_user(conn: Any, *, email: str, metadata: Mapping[str, Any]) -> str:
    """A throwaway account; the sign-up trigger builds every dependent row (EF-1)."""
    row = (
        (
            await conn.execute(
                INSERT_AUTH_USER,
                {
                    "email": email,
                    "metadata": json.dumps(dict(metadata), ensure_ascii=False),
                    "app_metadata": json.dumps({"provider": "email", "providers": ["email"]}),
                },
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise AppError("INTERNAL_ERROR")
    return str(row["id"])


@asynccontextmanager
async def rolled_back(deps: Any) -> AsyncIterator[Tx]:
    """`withRollback`: an owner-role transaction that is always rolled back.

    The demonstrations build a fixture, measure it and show the result; nothing they write may
    survive the request. The transaction is opened on the shared engine and rolled back here, so a
    page never mutates the database, exactly like the TypeScript helper.
    """
    async with deps.db.engine.connect() as connection:
        transaction = await connection.begin()
        try:
            yield Tx(conn=connection, actor=None)
        finally:
            await transaction.rollback()
