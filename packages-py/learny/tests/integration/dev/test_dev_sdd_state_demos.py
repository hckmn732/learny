"""[SPEC-2207] The state-summary SDD demonstration pages through the facade.

The schema, account, delivery, destination and credential pages read the demonstration database and
answer the shape of their TypeScript loader. The development guard refuses everything outside
`ENABLE_SDD_PAGES`.
"""

from types import SimpleNamespace
from typing import Any

import pytest
from dev_route_support import DevDeps, build_dev_app
from learny.shared.db.uow import Database
from learny.shared.locale_fr import dev_sdd_fixtures as fixture
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = (
    "dev.sdd.spec-101.demo",
    "dev.sdd.spec-102.create",
    "dev.sdd.spec-102.demo",
    "dev.sdd.spec-102.remove",
    "dev.sdd.spec-109.demo",
    "dev.sdd.spec-202.demo",
    "dev.sdd.spec-505.demo",
)
PATHS = {
    "dev.sdd.spec-101.demo": "/api/v1/dev/sdd/SPEC-101/demo",
    "dev.sdd.spec-102.create": "/api/v1/dev/sdd/SPEC-102/create",
    "dev.sdd.spec-102.demo": "/api/v1/dev/sdd/SPEC-102/demo",
    "dev.sdd.spec-102.remove": "/api/v1/dev/sdd/SPEC-102/remove",
    "dev.sdd.spec-109.demo": "/api/v1/dev/sdd/SPEC-109/demo",
    "dev.sdd.spec-202.demo": "/api/v1/dev/sdd/SPEC-202/demo",
    "dev.sdd.spec-505.demo": "/api/v1/dev/sdd/SPEC-505/demo",
}
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}
IDEMPOTENT = {"idempotency-key": "demo-sdd-state-1", **JSON_ACCEPT}


def settings(app_env: str = "test") -> Any:
    return SimpleNamespace(enable_sdd_pages="true", app_env=app_env)


def build(database: Database | None, app_env: str = "test") -> tuple[Any, Any]:
    return build_dev_app(
        (), DevDeps(db=database, settings=settings(app_env)), ENABLED, pipeline_ids=ROUTE_IDS
    )


async def test_the_schema_page_measures_the_extensions_of_the_local_stack(
    database: Database,
) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-101.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200
    body = response.json()
    names = [entry["name"] for entry in body["extensions"]]
    assert names == sorted(names)
    assert "pgcrypto" in names
    migrations = [entry["version"] for entry in body["migrations"]]
    assert migrations == sorted(migrations)
    sample = next(entry for entry in body["functions"] if entry["name"] == "immutable_unaccent_sample")
    assert sample["value"] == fixture.UNACCENT_EXPECTED
    enums = {entry["name"]: entry["values"] for entry in body["enums"]}
    assert enums["actor"] == ["tutor", "learner", "import"]
    assert body["rls"]["userA"]["identity"]["role"] == "authenticated"
    assert body["rls"]["userA"]["identity"]["uid"] == body["rls"]["userA"]["id"]
    assert body["rls"]["service"]["uid"] is None


async def test_the_account_page_creates_reads_and_removes_the_demo_account(
    database: Database,
) -> None:
    _app, client = build(database)
    try:
        created = client.post(PATHS["dev.sdd.spec-102.create"], json={}, headers=IDEMPOTENT)
        assert created.status_code == 200
        assert created.json() is None

        demo = client.get(PATHS["dev.sdd.spec-102.demo"], headers=JSON_ACCEPT)
        assert demo.status_code == 200
        body = demo.json()
        assert body["profile"]["timezone"] == fixture.DEMO_102_TIMEZONE
        assert body["profile"]["email"].startswith("spec102-")
        assert body["study"]["studyDays"] == [1, 2, 3, 4, 5]
        assert [entry["key"] for entry in body["constraints"]] == ["cl2", "cl3", "cl4", "cl5"]
        assert all(entry["ok"] for entry in body["constraints"])
    finally:
        removed = client.post(PATHS["dev.sdd.spec-102.remove"], json={}, headers=IDEMPOTENT)
        assert removed.status_code == 200
        assert removed.json() is None

    after = client.get(PATHS["dev.sdd.spec-102.demo"], headers=JSON_ACCEPT)
    assert after.json() is None


async def test_the_delivery_page_shows_the_journal_of_three_notifications(
    database: Database,
) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-109.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200
    body = response.json()
    assert body["unreadCount"] == 2
    assert body["unreadNotifications"] == 2
    titles = [entry["title"] for entry in body["notifications"]]
    assert titles == [
        fixture.DEMO_WEEKLY_REVIEW["title"],
        fixture.DEMO_GAP["title"],
        fixture.DEMO_DIGEST["title"],
    ]
    assert body["notifications"][-1]["readAt"] == fixture.DEMO_DIGEST_READ_AT
    statuses = {
        (entry["notificationTitle"], entry["channel"]): entry["status"] for entry in body["deliveries"]
    }
    assert statuses[(fixture.DEMO_DIGEST["title"], "email")] == "sent"
    assert statuses[(fixture.DEMO_GAP["title"], "push")] == "deferred_quiet"
    assert len(body["deliveries"]) == 4


async def test_the_destination_page_covers_the_seven_profiles() -> None:
    _app, client = build(None)

    response = client.get(PATHS["dev.sdd.spec-202.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200
    destinations = {entry["id"]: entry["value"] for entry in response.json()["destinations"]}
    assert destinations["profil"] == "/premiers-pas/profil"
    assert destinations["ia"] == "/premiers-pas/ia"
    assert destinations["next"] == "/agenda"
    assert destinations["external"] == "/accueil"
    assert destinations["deletion"] == "/parametres#profil"


async def test_the_credential_page_never_exposes_a_plaintext_key(database: Database) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-505.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200
    body = response.json()
    assert [entry["value"] for entry in body["providers"]] == [
        "anthropic",
        "openai",
        "mistral",
        "deepseek",
        "openai_compatible",
        "local",
    ]
    assert body["providers"][-1]["requiresBaseUrl"] is True
    assert body["providers"][-1]["keyOptional"] is True
    assert "apiKey" not in body["rawJson"]
    if body["error"] is None:
        assert body["credentials"]
    else:
        assert body["error"] == fixture.DEMO_SEED_MISSING


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", PATHS["dev.sdd.spec-101.demo"]),
        ("post", PATHS["dev.sdd.spec-102.create"]),
        ("get", PATHS["dev.sdd.spec-102.demo"]),
        ("post", PATHS["dev.sdd.spec-102.remove"]),
        ("get", PATHS["dev.sdd.spec-109.demo"]),
        ("get", PATHS["dev.sdd.spec-202.demo"]),
        ("get", PATHS["dev.sdd.spec-505.demo"]),
    ],
)
async def test_the_guard_refuses_the_demonstration_in_production(method: str, path: str) -> None:
    _app, client = build(None, app_env="production")
    # the contract parses the body before the handler; an empty demonstration body keeps it valid.
    response = (
        client.get(path, headers=JSON_ACCEPT)
        if method == "get"
        else client.post(path, json={}, headers=IDEMPOTENT)
    )

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
