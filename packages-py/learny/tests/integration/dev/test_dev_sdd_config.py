"""[SPEC-2302] The configuration demonstration through the facade.

The page shows the modes of the running environment, the presence of the six public values and the
names the simulated production environment refuses, never a secret.
"""

from types import SimpleNamespace
from typing import Any

import pytest
from dev_route_support import DevDeps, build_dev_app
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND
from learny_api.dev_demos.sdd_config import (
    PRODUCTION_REQUIRED_KEYS,
    PUBLIC_ENV_KEYS,
    SERVER_ENV_KEYS,
    SIMULATED_KEYS,
)

pytestmark = pytest.mark.spec("SPEC-2302")

ROUTE_ID = "dev.sdd.spec-009.demo"
PATH = "/api/v1/dev/sdd/SPEC-009/demo"
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}


def settings(app_env: str = "test") -> Any:
    return SimpleNamespace(
        enable_sdd_pages="true",
        app_env=app_env,
        llm_mode="mock",
        stripe_mode=None,
        email_mode=None,
        push_mode=None,
    )


def build(app_env: str = "test") -> tuple[Any, Any]:
    deps = DevDeps(settings=settings(app_env))
    return build_dev_app((), deps, ENABLED, pipeline_ids=(ROUTE_ID,))


async def test_the_configuration_page_answers_the_modes_and_the_refused_names() -> None:
    _app, client = build()

    response = client.get(PATH, headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["appEnv"] == "test"
    assert body["modes"] == {
        "llm": "mock",
        "stripe": "mock",
        "email": "memory",
        "push": "mock",
    }
    assert list(body["publicConfigured"]) == list(PUBLIC_ENV_KEYS)
    assert all(isinstance(value, bool) for value in body["publicConfigured"].values())
    assert body["serverCount"] == len(SERVER_ENV_KEYS)
    assert body["simulated"] == {key: True for key in SIMULATED_KEYS}
    assert body["invalidFields"] == [name for name in PRODUCTION_REQUIRED_KEYS if name != "DATABASE_URL"] + [
        "ENABLE_SDD_PAGES"
    ]
    assert "ANTHROPIC_API_KEY" not in body["invalidFields"]


async def test_the_configuration_page_never_returns_a_secret_value() -> None:
    _app, client = build()

    response = client.get(PATH, headers=JSON_ACCEPT)

    text = response.text
    assert "sentinel" not in text
    assert "postgresql://" not in text


async def test_the_guard_refuses_the_configuration_page_in_production() -> None:
    _app, client = build("production")

    response = client.get(PATH, headers=JSON_ACCEPT)

    assert response.status_code == 404, response.text
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
