"""[SPEC-2207] The coverage, auth-proxy and Checkout-session demonstration routes.

These three routes traverse the pipeline and read the development flag from the settings inside the
handler, like the TypeScript `guarded()`. The guard refuses everything outside `ENABLE_SDD_PAGES`.
"""

from types import SimpleNamespace
from typing import Any

import pytest
from dev_route_support import DevDeps, build_dev_app
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = ("dev.sddApiCoverage", "dev.sddAuthProxy", "dev.sdd.stripe.session")
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}
IDEMPOTENT = {"idempotency-key": "demo-stripe-session-1", **JSON_ACCEPT}


def settings(app_env: str = "test", flag: str = "true") -> Any:
    return SimpleNamespace(enable_sdd_pages=flag, app_env=app_env)


def build(dev_settings: Any) -> tuple[Any, Any]:
    return build_dev_app((), DevDeps(settings=dev_settings), ENABLED, pipeline_ids=ROUTE_IDS)


async def test_the_coverage_demo_answers_the_contract_tables() -> None:
    _app, client = build(settings())

    response = client.get("/api/v1/dev/sdd/api/coverage", headers=JSON_ACCEPT)

    assert response.status_code == 200
    body = response.json()
    assert body["registry"] > 0
    assert body["specials"] > 0
    assert body["files"] == body["generated"]
    assert body["drift"] == 0
    assert body["uncovered"] == []
    assert body["specialDrift"] == []


async def test_the_auth_proxy_answers_ok() -> None:
    _app, client = build(settings())

    response = client.post("/api/v1/dev/sdd/auth/proxy", headers=JSON_ACCEPT)

    assert response.status_code == 200
    assert response.json() == {"ok": True}


async def test_the_session_demo_ignores_an_unknown_session() -> None:
    _app, client = build(settings())

    response = client.post(
        "/api/v1/dev/sdd/stripe/session", json={"id": "cs_mock_999999999"}, headers=IDEMPOTENT
    )

    assert response.status_code == 200
    assert response.json() == {"sessionId": None}


async def test_the_session_demo_answers_null_without_an_identifier() -> None:
    _app, client = build(settings())

    response = client.post("/api/v1/dev/sdd/stripe/session", json={}, headers=IDEMPOTENT)

    assert response.status_code == 200
    assert response.json() == {"sessionId": None}


@pytest.mark.parametrize(
    ("method", "path", "headers"),
    [
        ("get", "/api/v1/dev/sdd/api/coverage", JSON_ACCEPT),
        ("post", "/api/v1/dev/sdd/auth/proxy", JSON_ACCEPT),
        ("post", "/api/v1/dev/sdd/stripe/session", IDEMPOTENT),
    ],
)
async def test_the_guard_refuses_the_demonstration_in_production(
    method: str, path: str, headers: dict[str, str]
) -> None:
    _app, client = build(settings(app_env="production"))
    # the contract parses the body before the handler; a demonstration body keeps it valid.
    response = (
        client.get(path, headers=headers) if method == "get" else client.post(path, json={}, headers=headers)
    )

    assert response.status_code == 404, response.text
    assert response.json()["detail"] == RESOURCE_NOT_FOUND


async def test_the_guard_refuses_the_demonstration_when_the_flag_is_closed() -> None:
    _app, client = build(settings(flag="false"))
    response = client.get("/api/v1/dev/sdd/api/coverage", headers=JSON_ACCEPT)

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
