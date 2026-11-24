"""[SPEC-2207] The special registry installs every `dev.*` entry exactly once.

A development route is served by the special registry (guard before authentication); the other
`dev.*` operations are served by the pipeline. The test builds the real facade, so a missing
registry entry fails here, before any deployment (SPEC-2302 removed the ownership table that used
to select them).
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi import FastAPI
from learny.shared.config import Settings
from learny_api import handlers  # noqa: F401 - registers the @handler roles
from learny_api.generated.routes import ROUTES_BY_ID
from learny_api.main import create_app
from learny_api.special import DEVELOPMENT_ROUTE_IDS

pytestmark = pytest.mark.spec("SPEC-2207")

ROOT = Path(__file__).resolve().parents[4]


@pytest.fixture
def app() -> FastAPI:
    instance = create_app(Settings(app_env="test"))

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


def test_every_development_operation_is_installed_once(app: FastAPI) -> None:
    expected = {route_id for route_id in ROUTES_BY_ID if route_id.startswith("dev.")}
    found = installed_developments(app)
    names = [
        getattr(route, "name", "")
        for route in app.routes
        if getattr(route, "name", "").startswith(("special:dev.", "py:dev."))
    ]

    assert set(found) == expected
    assert len(names) == len(expected)


def test_every_special_development_route_uses_the_special_registry(app: FastAPI) -> None:
    installed = {route_id for route_id, kind in installed_developments(app).items() if kind == "special"}

    assert installed == set(DEVELOPMENT_ROUTE_IDS)
    assert all(ROUTES_BY_ID[route_id].id == route_id for route_id in DEVELOPMENT_ROUTE_IDS)


def test_the_development_guard_is_installed_in_production(app: FastAPI) -> None:
    instance = create_app(Settings(app_env="production"), context=app.state.pipeline)
    names = {getattr(route, "name", "") for route in instance.routes}

    assert "special:dev.email.outbox" in names
