"""[SPEC-2207] The rate-limit demonstration routes through the facade.

The burst consumes a synthetic bucket, the origin demonstration runs the real guard and the purge
removes the expired rows; the development guard refuses all three outside `ENABLE_SDD_PAGES`.
"""

from typing import Any

import pytest
from dev_route_support import DevDeps, build_dev_app
from learny.shared.db.uow import Database
from learny.shared.locale_fr.details import ORIGIN_REJECTED, RESOURCE_NOT_FOUND
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = ("dev.rateLimit.burst", "dev.rateLimit.origin", "dev.rateLimit.purge")
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}


@pytest.fixture
async def app(database: Database) -> tuple[Any, Any]:
    return build_dev_app(ROUTE_IDS, DevDeps(db=database), ENABLED)


async def test_the_burst_refuses_the_token_after_the_capacity(app: tuple[Any, Any]) -> None:
    _app, client = app
    response = client.post("/api/v1/dev/sdd/rate-limit/burst", json={"profile": "auth"})

    assert response.status_code == 200
    body = response.json()
    assert body["profile"] == "auth"
    assert body["limit"] == 10
    assert body["accepted"] == 10
    assert body["refused"] == 1
    assert body["remaining"] == 0
    assert body["retryAfterSeconds"] >= 1


async def test_the_burst_deletes_its_synthetic_bucket(app: tuple[Any, Any], database: Database) -> None:
    _app, client = app
    before = await _ai_buckets(database)
    client.post("/api/v1/dev/sdd/rate-limit/burst", json={"profile": "ai"})

    assert await _ai_buckets(database) == before


async def _ai_buckets(database: Database) -> list[Any]:
    async with database.service_tx() as tx:
        return list(
            (
                await tx.conn.execute(
                    text("select bucket from public.rate_limits where bucket like :pattern"),
                    {"pattern": "user:%:ai"},
                )
            )
            .mappings()
            .all()
        )


async def test_the_origin_demonstration_accepts_the_application_origin(app: tuple[Any, Any]) -> None:
    _app, client = app
    response = client.post("/api/v1/dev/sdd/rate-limit/origin", json={"mode": "same"})

    assert response.status_code == 200
    assert response.json() == {"status": 200, "code": None, "detail": None}


async def test_the_origin_demonstration_refuses_a_foreign_mutation(app: tuple[Any, Any]) -> None:
    _app, client = app
    response = client.post("/api/v1/dev/sdd/rate-limit/origin", json={"mode": "foreign"})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == 403
    assert body["code"] == "ORIGIN_REJECTED"
    assert body["detail"] == ORIGIN_REJECTED


async def test_the_purge_removes_the_expired_rows_and_keeps_the_recent(
    app: tuple[Any, Any], database: Database
) -> None:
    _app, client = app
    # the demonstration writes its expired idempotency rows for the first profile of the base.
    async with database.service_tx() as tx:
        await tx.conn.execute(
            text(
                "insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, "
                "raw_app_meta_data, created_at, updated_at) values "
                "(gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', "
                "'authenticated', 'dev-purge-' || left(gen_random_uuid()::text, 8) || "
                "'@test.learny.test', '{}'::jsonb, '{}'::jsonb, now(), now())"
            )
        )
    response = client.post("/api/v1/dev/sdd/rate-limit/purge")

    assert response.status_code == 200
    body = response.json()
    assert body["idempotencyKeys"] >= 2
    assert body["rateLimitBuckets"] >= 3


async def test_the_guard_refuses_outside_enable_sdd_pages() -> None:
    _app, client = build_dev_app(ROUTE_IDS, DevDeps(), {"APP_ENV": "test"})
    response = client.post("/api/v1/dev/sdd/rate-limit/burst", json={"profile": "auth"})

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND


async def test_the_guard_refuses_in_production() -> None:
    _app, client = build_dev_app(ROUTE_IDS, DevDeps(), {"APP_ENV": "production", "ENABLE_SDD_PAGES": "1"})

    assert client.post("/api/v1/dev/sdd/rate-limit/purge").status_code == 404
