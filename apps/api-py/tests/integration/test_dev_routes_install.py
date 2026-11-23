"""[SPEC-2207] The real ownership table installs every `dev.*` entry exactly once.

A development route is served by the special registry (guard before authentication); every other
`py` operation is served by the pipeline. The test builds the real facade, so a missing registry
entry or a flipped key without handler fails here, before any deployment.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi import FastAPI
from learny.shared.config import Settings
from learny.shared.ownership import load_ownership
from learny_api import handlers  # noqa: F401 - registers the @handler roles
from learny_api.generated.routes import ROUTES_BY_ID
from learny_api.main import create_app
from learny_api.special import DEVELOPMENT_ROUTE_IDS

pytestmark = pytest.mark.spec("SPEC-2207")

ROOT = Path(__file__).resolve().parents[4]


@pytest.fixture
def app() -> FastAPI:
    settings = Settings(app_env="test", py_hono_upstream_url="http://upstream")
    instance = create_app(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield

    instance.router.lifespan_context = lifespan
    return instance


def installed_developments(app: FastAPI) -> dict[str, str]:
    """Route id -> 'special' or 'pipeline', from the registered route names."""
    found: dict[str, str] = {}
    for route in app.routes:
        name = getattr(route, "name", "")
        if name.startswith("special:dev."):
            found[name.removeprefix("special:")] = "special"
        elif name.startswith("py:dev."):
            found[name.removeprefix("py:")] = "pipeline"
    return found


def test_every_python_development_operation_is_installed_once(app: FastAPI) -> None:
    ownership = load_ownership(ROOT / "api" / "ownership.yaml")
    expected = {
        operation
        for operation, owner in ownership.operations.items()
        if operation.startswith("dev.") and owner == "py"
    }
    found = installed_developments(app)

    assert set(found) == expected
    assert all(owner == "py" for owner in ownership.operations.values() if owner not in ("ts",))


def test_every_python_special_development_route_uses_the_special_registry(app: FastAPI) -> None:
    ownership = load_ownership(ROOT / "api" / "ownership.yaml")
    installed = {route_id for route_id, kind in installed_developments(app).items() if kind == "special"}
    expected = {route_id for route_id in DEVELOPMENT_ROUTE_IDS if ownership.operations.get(route_id) == "py"}
    assert installed == expected
    assert all(ROUTES_BY_ID[route_id].id == route_id for route_id in DEVELOPMENT_ROUTE_IDS)


def test_the_development_guard_of_the_real_table_is_closed_in_production(app: FastAPI) -> None:
    ownership = load_ownership(ROOT / "api" / "ownership.yaml")
    settings = Settings(app_env="production", py_hono_upstream_url="http://upstream")
    instance = create_app(settings, ownership=ownership, context=app.state.pipeline)
    names = {getattr(route, "name", "") for route in instance.routes}

    assert "special:dev.email.outbox" in names
