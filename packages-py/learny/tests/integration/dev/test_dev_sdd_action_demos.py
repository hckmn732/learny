"""[SPEC-2207] The action pages of the SDD demonstrations through the facade.

The brick page only announces the demonstration account, the key page creates then removes a
personal key on the seeded account, and the qualification run builds and removes its own account for
one request. The development guard refuses everything outside `ENABLE_SDD_PAGES`.
"""

import json
from types import SimpleNamespace
from typing import Any

import pytest
from dev_route_support import DevDeps, build_dev_app
from factories.byok_support import FAKE_ENCRYPTION_KEY
from learny.platform.llm.gateway import MockGateway
from learny.platform.llm.mock import load_registry
from learny.shared.db.uow import Database
from learny.shared.locale_fr import dev_sdd_fixtures as fixture
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND
from learny_api.dev_demos.support import DELETE_AUTH_USER, new_user
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = (
    "dev.sdd.spec-501.demo",
    "dev.sdd.spec-505.create",
    "dev.sdd.spec-505.delete",
    "dev.sdd.spec-506.run",
)
PATHS = {
    "dev.sdd.spec-501.demo": "/api/v1/dev/sdd/SPEC-501/demo",
    "dev.sdd.spec-505.create": "/api/v1/dev/sdd/SPEC-505/create",
    "dev.sdd.spec-505.delete": "/api/v1/dev/sdd/SPEC-505/delete",
    "dev.sdd.spec-506.run": "/api/v1/dev/sdd/SPEC-506/run",
}
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}
IDEMPOTENT = {"idempotency-key": "demo-sdd-action-1", **JSON_ACCEPT}
COUNT_DEMO_RUNS = text("select count(*)::int as count from auth.users where email like 'sdd-506-demo-%'")


@pytest.fixture(autouse=True)
def master_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """The BYOK envelope needs a master key; the value is a dummy of the tests."""
    monkeypatch.setenv("APP_ENCRYPTION_KEY", FAKE_ENCRYPTION_KEY)


def settings(app_env: str = "test") -> Any:
    return SimpleNamespace(enable_sdd_pages="true", app_env=app_env)


def build(database: Database | None, app_env: str = "test") -> tuple[Any, Any]:
    deps = DevDeps(db=database, settings=settings(app_env), llm=MockGateway(load_registry()))
    return build_dev_app((), deps, ENABLED, pipeline_ids=ROUTE_IDS)


async def seed_demo_account(database: Database) -> str:
    async with database.service_tx() as tx:
        return await new_user(tx.conn, email=fixture.DEMO_USER_EMAIL, metadata={"first_name": "Alex"})


async def remove_demo_account(database: Database) -> None:
    async with database.service_tx() as tx:
        await tx.conn.execute(DELETE_AUTH_USER, {"email": fixture.DEMO_USER_EMAIL})


async def test_the_brick_page_announces_whether_the_demo_account_exists(database: Database) -> None:
    _app, client = build(database)
    await remove_demo_account(database)

    missing = client.get(PATHS["dev.sdd.spec-501.demo"], headers=JSON_ACCEPT)
    assert missing.status_code == 200
    assert missing.json() == {"brick": None, "error": fixture.DEMO_SEED_MISSING}

    try:
        await seed_demo_account(database)
        present = client.get(PATHS["dev.sdd.spec-501.demo"], headers=JSON_ACCEPT)
        assert present.status_code == 200
        assert present.json() == {"brick": None, "error": None}
    finally:
        await remove_demo_account(database)


async def test_the_key_page_creates_lists_and_removes_a_personal_key(database: Database) -> None:
    _app, client = build(database)
    await remove_demo_account(database)
    try:
        await seed_demo_account(database)
        created = client.post(
            PATHS["dev.sdd.spec-505.create"],
            json={"provider": "openai", "model": "gpt-demo", "apiKey": "sk-demo-0000"},
            headers=IDEMPOTENT,
        )
        assert created.status_code == 200
        body = created.json()
        assert body["error"] is None
        assert [entry["provider"] for entry in body["credentials"]] == ["openai"]
        assert body["storage"]["bytes"] > 0
        assert "sk-demo-0000" not in body["rawJson"]
        credential_id = body["credentials"][0]["id"]

        incomplete = client.post(
            PATHS["dev.sdd.spec-505.create"],
            json={"provider": "openai"},
            headers=IDEMPOTENT,
        )
        assert incomplete.status_code == 400
        assert incomplete.json()["detail"] == fixture.CHOOSE_PROVIDER_MODEL

        missing_id = client.post(PATHS["dev.sdd.spec-505.delete"], json={}, headers=IDEMPOTENT)
        assert missing_id.status_code == 400
        assert missing_id.json()["detail"] == fixture.KEY_ID_MISSING

        removed = client.post(
            PATHS["dev.sdd.spec-505.delete"], json={"id": credential_id}, headers=IDEMPOTENT
        )
        assert removed.status_code == 200
        assert removed.json()["credentials"] == []
    finally:
        await remove_demo_account(database)


async def test_the_qualification_run_builds_and_removes_its_own_account(database: Database) -> None:
    _app, client = build(database)

    success = client.post(PATHS["dev.sdd.spec-506.run"], json={"scenario": "success"}, headers=IDEMPOTENT)
    assert success.status_code == 200
    first = success.json()
    assert first["scenario"] == "success"
    assert json.loads(first["input"]) == {"modelId": "gpt-qualification-demo", "task": "tutor"}
    assert first["error"] is None
    assert first["report"] is not None

    invalid = client.post(PATHS["dev.sdd.spec-506.run"], json={"scenario": "invalid"}, headers=IDEMPOTENT)
    assert invalid.status_code == 200
    assert invalid.json()["scenario"] == "invalid"

    async with database.service_tx() as tx:
        remaining = (await tx.conn.execute(COUNT_DEMO_RUNS)).scalar_one()
    assert remaining == 0


async def test_the_key_page_refuses_the_demonstration_without_the_demo_account(
    database: Database,
) -> None:
    _app, client = build(database)
    await remove_demo_account(database)

    response = client.post(
        PATHS["dev.sdd.spec-505.create"],
        json={"provider": "openai", "model": "gpt-demo"},
        headers=IDEMPOTENT,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == fixture.DEMO_ABSENT


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", PATHS["dev.sdd.spec-501.demo"]),
        ("post", PATHS["dev.sdd.spec-505.create"]),
        ("post", PATHS["dev.sdd.spec-505.delete"]),
        ("post", PATHS["dev.sdd.spec-506.run"]),
    ],
)
async def test_the_guard_refuses_the_demonstration_in_production(method: str, path: str) -> None:
    _app, client = build(None, app_env="production")
    response = (
        client.get(path, headers=JSON_ACCEPT)
        if method == "get"
        else client.post(path, json={}, headers=IDEMPOTENT)
    )

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
