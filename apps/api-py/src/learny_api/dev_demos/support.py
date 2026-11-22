"""Shared helpers of the development demonstrations (SPEC-2207)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from learny.engagement import public as engagement
from learny.shared.db.uow import Tx


def emails_for(deps: Any, to: str | None) -> list[dict[str, str]]:
    """`emailsFor`: the messages the memory transport captured for one recipient."""
    items = engagement.list_demo_outbox(deps)["items"]
    return [
        {"template": item["template"] or "email", "to": item["to"], "at": item["at"]}
        for item in items
        if to is None or item["to"] == to
    ]


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
