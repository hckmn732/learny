"""Shared helpers of the development demonstrations (SPEC-2207)."""

import json
import re
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

from learny.engagement import public as engagement
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.time import to_iso
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

INSERT_AUTH_USER = text(
    "insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, "
    "raw_app_meta_data, created_at, updated_at) values (gen_random_uuid(), "
    "'00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', :email, "
    "cast(:metadata as jsonb), cast(:app_metadata as jsonb), now(), now()) "
    "returning id::text as id"
)
DELETE_AUTH_USER = text("delete from auth.users where email = :email")


def sqlstate_of(error: BaseException) -> str:
    """The SQLSTATE of a refused statement, or `unknown` (port of `failureOf().code`)."""
    current: BaseException | None = error
    for _ in range(8):
        if current is None:
            break
        for candidate in (current, getattr(current, "orig", None), getattr(current, "cause", None)):
            code = getattr(candidate, "sqlstate", None) or getattr(candidate, "pgcode", None)
            if isinstance(code, str) and len(code) == 5:
                return code
        current = current.__cause__ or current.__context__
    return "unknown"


def failure_message(error: BaseException) -> str:
    """The innermost message of a refused statement (port of `failureOf().message`)."""
    messages: list[str] = []
    current: BaseException | None = error
    for _ in range(8):
        if current is None:
            break
        original = getattr(current, "orig", None)
        if isinstance(original, BaseException):
            messages.append(str(original))
            current = original.__cause__
            continue
        messages.append(str(current))
        current = current.__cause__ or current.__context__
    return messages[-1] if messages else ""


async def probe(
    conn: Any, name: str, statement: Any, params: Mapping[str, Any] | None = None
) -> dict[str, str]:
    """Runs one statement inside a savepoint and returns its SQLSTATE and message.

    The savepoint is always rolled back on failure, so the surrounding transaction keeps going and
    the demonstration can measure several limits in a row (port of `attempt`).
    """
    await conn.execute(text(f"savepoint {name}"))
    try:
        await conn.execute(statement, dict(params) if params is not None else {})
    except DBAPIError as error:
        await conn.execute(text(f"rollback to savepoint {name}"))
        return {"code": sqlstate_of(error), "message": failure_message(error)}
    finally:
        await conn.execute(text(f"release savepoint {name}"))
    return {"code": "00000", "message": ""}


def raised_code(message: str, candidates: tuple[str, ...], fallback: str) -> str:
    """`codedMessage`: the raised code or the violated constraint name of a probe message."""
    for code in candidates:
        if code in message:
            return code
    found = re.search(r"(resources?_[a-z_]+)", message)
    return found.group(1) if found is not None else fallback


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
