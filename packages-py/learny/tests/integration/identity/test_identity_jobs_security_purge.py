"""[SPEC-2207] The hourly security purge against the local stack.

The keys created more than twenty-four hours ago and the buckets untouched for twenty-four hours
are deleted, the boundary rows are kept, and a replayed tick deletes nothing. The fixture mirrors
`packages/jobs/test/integration/security-purge.test.ts`.
"""

from datetime import datetime
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import create_user
from factories.learning_deps import learning_deps
from learny.identity.application.purge_security import purge_security_rows
from learny.shared.db.uow import Database
from learny.shared.time import parse_iso
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

NOW = parse_iso("2026-11-11T12:20:00Z")
DAY_SECONDS = 24 * 3600

INSERT_KEY = text(
    """
    insert into public.idempotency_keys
      (key, user_id, route, request_hash, status_code, created_at, completed_at)
    values (
      :key, cast(:user as uuid), '/api/v1/x', :hash, 201,
      cast(:created as timestamptz), cast(:created as timestamptz)
    )
    """
)
INSERT_BUCKET = text(
    """
    insert into public.rate_limits (bucket, tokens, updated_at)
    values (:bucket, 3, cast(:updated as timestamptz))
    """
)
KEYS_LIKE = text("select key from public.idempotency_keys where key like :prefix order by key")
BUCKETS_LIKE = text("select bucket from public.rate_limits where bucket like :prefix order by bucket")


def at(age_seconds: int) -> datetime:
    return datetime.fromtimestamp(NOW.timestamp() - age_seconds, tz=NOW.tzinfo)


async def seed(tx: Any, tag: str, user_id: str) -> None:
    for name, age in (("old", DAY_SECONDS + 1), ("edge", DAY_SECONDS), ("recent", DAY_SECONDS - 60)):
        created = at(age)
        await tx.conn.execute(
            INSERT_KEY,
            {"key": f"purge-{tag}-{name}", "user": user_id, "hash": "b" * 64, "created": created},
        )
        await tx.conn.execute(INSERT_BUCKET, {"bucket": f"user:purge-{tag}:{name}", "updated": created})


async def test_keys_and_buckets_older_than_twenty_four_hours_are_deleted_and_the_rest_is_kept(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        tag = "seven"
        user_id = await create_user(tx.conn, "Nestor")
        await seed(tx, tag, user_id)
        deps = learning_deps(tx, now=NOW)

        removed = await purge_security_rows(deps)

        assert removed["idempotencyKeys"] >= 1
        assert removed["rateLimitBuckets"] >= 1
        keys = (await tx.conn.execute(KEYS_LIKE, {"prefix": f"purge-{tag}-%"})).mappings().all()
        assert [row["key"] for row in keys] == [f"purge-{tag}-edge", f"purge-{tag}-recent"]
        buckets = (await tx.conn.execute(BUCKETS_LIKE, {"prefix": f"user:purge-{tag}:%"})).mappings().all()
        assert [row["bucket"] for row in buckets] == [
            f"user:purge-{tag}:edge",
            f"user:purge-{tag}:recent",
        ]

    await rolled_back(database, run)


async def test_a_replayed_hourly_tick_purges_once(database: Database) -> None:
    async def run(tx: Any) -> None:
        tag = "replay"
        user_id = await create_user(tx.conn, "Ombeline")
        await seed(tx, tag, user_id)
        deps = learning_deps(tx, now=NOW)

        first = await purge_security_rows(deps)
        second = await purge_security_rows(deps)

        assert first["idempotencyKeys"] >= 1
        assert first["rateLimitBuckets"] >= 1
        assert second == {"idempotencyKeys": 0, "rateLimitBuckets": 0}
        assert (await tx.conn.execute(KEYS_LIKE, {"prefix": f"purge-{tag}-%"})).mappings().all()

    await rolled_back(database, run)


async def test_a_key_of_the_boundary_instant_is_kept(database: Database) -> None:
    """Strictly older than 24 h is removed: the exact boundary survives."""

    async def run(tx: Any) -> None:
        tag = "boundary"
        user_id = await create_user(tx.conn, "Perrine")
        for name in ("edge", "before"):
            created = at(DAY_SECONDS if name == "edge" else DAY_SECONDS + 1)
            await tx.conn.execute(
                INSERT_KEY,
                {"key": f"purge-{tag}-{name}", "user": user_id, "hash": "c" * 64, "created": created},
            )
        deps = learning_deps(tx, now=NOW)

        await purge_security_rows(deps)

        keys = (await tx.conn.execute(KEYS_LIKE, {"prefix": f"purge-{tag}-%"})).mappings().all()
        assert [row["key"] for row in keys] == [f"purge-{tag}-edge"]

    await rolled_back(database, run)
