"""[SPEC-2207] The static SDD demonstration pages through the facade.

The job registry, the API coverage, the redacted credential snapshot, the storage buckets and the
client dependency report are pure answers, served behind the development flag.
"""

from types import SimpleNamespace
from typing import Any

import pytest
from dev_route_support import DevDeps, build_dev_app
from learny.platform.storage import STORAGE_BUCKETS
from learny.shared.locale_fr import dev_sdd_fixtures as fixture
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = (
    "dev.sdd.spec-007.demo",
    "dev.sdd.spec-1004.demo",
    "dev.sdd.spec-110.demo",
    "dev.sdd.spec-114.demo",
    "dev.sdd.spec-1203.demo",
)
PATHS = {
    "dev.sdd.spec-007.demo": "/api/v1/dev/sdd/SPEC-007/demo",
    "dev.sdd.spec-1004.demo": "/api/v1/dev/sdd/SPEC-1004/demo",
    "dev.sdd.spec-110.demo": "/api/v1/dev/sdd/SPEC-110/demo",
    "dev.sdd.spec-114.demo": "/api/v1/dev/sdd/SPEC-114/demo",
    "dev.sdd.spec-1203.demo": "/api/v1/dev/sdd/SPEC-1203/demo",
}
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}


def settings(app_env: str = "test") -> Any:
    return SimpleNamespace(enable_sdd_pages="true", app_env=app_env)


def build(app_env: str = "test") -> tuple[Any, Any]:
    return build_dev_app((), DevDeps(settings=settings(app_env)), ENABLED, pipeline_ids=ROUTE_IDS)


async def test_the_job_page_shows_the_demo_consumer() -> None:
    _app, client = build()

    response = client.get(PATHS["dev.sdd.spec-007.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200
    assert response.json() == {"ids": "devtools.demo_job", "retries": 3}


async def test_the_coverage_page_lists_the_special_handlers() -> None:
    _app, client = build()

    response = client.get(PATHS["dev.sdd.spec-1004.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200
    body = response.json()
    assert body["coverage"]["registry"] > 0
    assert body["coverage"]["drift"] == 0
    keys = [entry["key"] for entry in body["specials"]]
    assert keys == sorted(keys)
    assert "POST /api/v1/dev/sdd/echo" in keys


async def test_the_credentials_page_is_the_redacted_snapshot() -> None:
    _app, client = build()

    response = client.get(PATHS["dev.sdd.spec-110.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200
    body = response.json()
    assert [entry["provider"] for entry in body["credentials"]] == ["anthropic", "deepseek"]
    assert body["credentials"][0]["keyLast4"] == fixture.CREDENTIAL_ANTHROPIC_LAST4
    assert body["subscription"]["status"] == "active"
    assert next(entry["task"] for entry in body["tasks"]) == "programme"


async def test_the_storage_page_shows_the_private_buckets() -> None:
    _app, client = build()

    response = client.get(PATHS["dev.sdd.spec-114.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200
    body = response.json()
    assert body["buckets"] == list(STORAGE_BUCKETS)
    assert body["path"] == (f"{fixture.DEMO_USER}/{fixture.DEMO_RESOURCE}/{fixture.DEMO_FILE_NAME}")


async def test_the_dependency_page_is_empty_after_the_migration() -> None:
    _app, client = build()

    response = client.get(PATHS["dev.sdd.spec-1203.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200
    body = response.json()
    assert set(body["categories"].values()) == {0}
    assert body["serverModules"] == 0
    assert body["dependencies"] == list(fixture.DEPENDENCIES)


@pytest.mark.parametrize("path", list(PATHS.values()))
async def test_the_guard_refuses_the_demonstration_in_production(path: str) -> None:
    _app, client = build(app_env="production")
    response = client.get(path, headers=JSON_ACCEPT)

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
