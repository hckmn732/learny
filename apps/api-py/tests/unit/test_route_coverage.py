"""[SPEC-2302] Every operation of the contract has exactly one handler and one installation.

The facade has no relay and no ownership table any more: `pipeline.install` registers every entry
of `learny_api.generated.routes` that the special registry does not own, and `special.install`
registers the routes outside the generic pipeline. This test reads `api/inventory.json`, the source
of the contract, so a forgotten handler or a route installed twice fails here, before any
deployment. The startup guard of `pipeline.install` (a route without a handler is a `RuntimeError`)
is pinned too, because it is now the only completeness check of the facade.
"""

import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from learny.shared.errors import ErrorEntry, load_catalog
from learny_api import handlers, pipeline, special  # noqa: F401 - handlers registers roles
from learny_api.generated.routes import ROUTES, ROUTES_BY_ID
from learny_api.pipeline import Call, PipelineContext
from learny_api.special import SPECIAL_ROUTE_IDS

pytestmark = pytest.mark.spec("SPEC-2302")

ROOT = Path(__file__).resolve().parents[4]
CATALOG: dict[str, ErrorEntry] = load_catalog(ROOT / "api" / "errors.json")
INVENTORY: dict[str, Any] = json.loads((ROOT / "api" / "inventory.json").read_text(encoding="utf-8"))
OPERATION_IDS = [str(item["id"]) for item in INVENTORY["operations"]]
INVENTORY_SPECIAL = {(str(item["method"]), str(item["path"])) for item in INVENTORY["special"]}
PARAM = re.compile(r"\{([^}]+)\}")


def context(registry: dict[str, Callable[[Call], Any]] | None = None) -> PipelineContext:
    """A context good enough to register routes; no guard runs while installing."""
    return PipelineContext(
        deps=None,  # type: ignore[arg-type]
        catalog=CATALOG,
        env={},
        origin_guard=None,  # type: ignore[arg-type]
        rate_limiter=None,
        idempotency=None,  # type: ignore[arg-type]
        handlers=dict(pipeline.HANDLERS) if registry is None else registry,
    )


def installed_names(app: FastAPI, prefix: str) -> list[str]:
    return [
        str(getattr(route, "name", "")).removeprefix(prefix)
        for route in app.routes
        if str(getattr(route, "name", "")).startswith(prefix)
    ]


def normalized(path: str) -> str:
    """Hono notation of an inventory path (`/x/{id}` -> `/x/:id`)."""
    return PARAM.sub(lambda match: ":" + match.group(1), path)


def test_every_operation_of_the_inventory_has_one_handler() -> None:
    assert sorted(OPERATION_IDS) == sorted(pipeline.HANDLERS)


def test_every_route_of_the_generated_table_is_an_operation() -> None:
    assert {route.id for route in ROUTES} == set(OPERATION_IDS)


def test_every_operation_is_installed_exactly_once() -> None:
    app = FastAPI()
    special.install(app, context())
    pipeline.install(app, context())

    special_names = installed_names(app, "special:")
    pipeline_names = installed_names(app, "py:")

    assert len(special_names) == len(set(special_names))
    assert len(pipeline_names) == len(set(pipeline_names))
    assert set(special_names) == set(SPECIAL_ROUTE_IDS)
    assert set(pipeline_names) == set(OPERATION_IDS) - set(SPECIAL_ROUTE_IDS)


def test_every_special_route_of_the_inventory_is_installed() -> None:
    app = FastAPI()
    special.install(app, context())

    found = {
        (method, normalized(str(getattr(route, "path", ""))))
        for route in app.routes
        if str(getattr(route, "name", "")).startswith("special:")
        for method in (getattr(route, "methods", None) or ())
    }

    assert found == INVENTORY_SPECIAL


def test_no_special_route_is_installed_twice() -> None:
    app = FastAPI()
    special.install(app, context())
    routes = [route for route in app.routes if str(getattr(route, "name", "")).startswith("special:")]
    keys = [
        (
            tuple(sorted(getattr(route, "methods", None) or ())),
            normalized(str(getattr(route, "path", ""))),
        )
        for route in routes
    ]

    assert len(keys) == len(set(keys))


def test_no_handler_is_orphaned() -> None:
    assert set(pipeline.HANDLERS) <= {route.id for route in ROUTES}


def test_a_route_without_a_handler_is_refused_at_installation() -> None:
    partial = dict(pipeline.HANDLERS)
    del partial[ROUTES_BY_ID["agenda.get"].id]

    with pytest.raises(RuntimeError, match="no handler"):
        pipeline.install(FastAPI(), context(partial))
