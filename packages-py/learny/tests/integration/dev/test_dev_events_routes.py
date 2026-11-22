"""[SPEC-2207] The jobs demonstration routes through the facade.

The pipeline start writes its outbox event for real, the run reads the state, the tick previews the
factory users and the outbox counts the caller's events. The development guard refuses all four.
"""

from typing import Any

import pytest
from dev_route_support import DevDeps, allow_authentication, build_dev_app
from learny.shared.db.uow import Database
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = (
    "dev.cron.hourlyTick",
    "dev.events.demo.run",
    "dev.events.demo.start",
    "dev.events.outbox",
)
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}


async def seeded_user(database: Database) -> str:
    async with database.service_tx() as tx:
        row = (
            (await tx.conn.execute(text("select id::text as id from public.profiles limit 1")))
            .mappings()
            .first()
        )
    if row is None:
        pytest.skip("the demonstration database has no seeded profile")
    return str(row["id"])


@pytest.fixture
async def app(database: Database) -> tuple[Any, Any]:
    return build_dev_app(ROUTE_IDS, DevDeps(db=database), ENABLED)


async def _cleanup(database: Database) -> None:
    async with database.service_tx() as tx:
        await tx.conn.execute(
            text("delete from public.event_outbox where event_id like :pattern"),
            {"pattern": "sdd-demo:%"},
        )


async def test_the_start_emits_the_pipeline_event(
    app: tuple[Any, Any], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch, await seeded_user(database))
    try:
        response = client.post(
            "/api/v1/dev/sdd/events/demo",
            json={"failOnceAt": "none"},
            headers={"idempotency-key": "dev-events-1"},
        )

        assert response.status_code == 202
        run_id = response.json()["jobId"]
        assert len(run_id) == 36

        state = client.get(f"/api/v1/dev/sdd/events/demo/{run_id}")
        assert state.status_code == 200
        assert state.json() == {
            "runId": run_id,
            "steps": [],
            "attempts": 0,
            "finishedAt": None,
        }
    finally:
        await _cleanup(database)


async def test_the_tick_previews_the_factory_users(
    app: tuple[Any, Any], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch, await seeded_user(database))
    response = client.post("/api/v1/dev/sdd/cron/hourly-tick", json={"at": "2026-11-11T12:20:00Z"})

    assert response.status_code == 200
    body = response.json()
    assert body["tickAt"] == "2026-11-11T12:20:00.000Z"
    assert isinstance(body["users"], list)


async def test_the_outbox_counts_the_callers_events(
    app: tuple[Any, Any], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch, await seeded_user(database))
    try:
        client.post(
            "/api/v1/dev/sdd/events/demo",
            json={"failOnceAt": "none"},
            headers={"idempotency-key": "dev-events-2"},
        )
        response = client.get("/api/v1/dev/sdd/events/outbox")

        assert response.status_code == 200
        assert response.json()["pending"] >= 1

        # SPEC-2102: the worker stamps `dispatched_at`; the event is no longer pending and the
        # demonstration counts it as sent, exactly like the TypeScript page did.
        async with database.service_tx() as tx:
            await tx.conn.execute(
                text(
                    "update public.event_outbox set dispatched_at = now(), sent_at = now()"
                    " where event_id like :pattern"
                ),
                {"pattern": "sdd-demo:%"},
            )
        dispatched = client.get("/api/v1/dev/sdd/events/outbox")
        assert dispatched.json()["pending"] == 0
        assert dispatched.json()["sent"] >= 1
    finally:
        await _cleanup(database)


async def test_the_guard_refuses_the_tick_in_production() -> None:
    _app, client = build_dev_app(ROUTE_IDS, DevDeps(), {"APP_ENV": "production", "ENABLE_SDD_PAGES": "true"})
    response = client.post("/api/v1/dev/sdd/cron/hourly-tick", json={})

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
