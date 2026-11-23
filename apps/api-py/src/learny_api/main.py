"""FastAPI facade of the Learny API (SPEC-2003, ADR-2005, ADR-2012).

In P20 every entry of `api/ownership.yaml` is owned by `ts`, so the facade relays 100 % of the
traffic to Hono. Python-owned operations are registered by later specs; the relay stays the
fallback for everything else.
"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from learny.shared.config import Settings, load_settings
from learny.shared.deps import build_deps
from learny.shared.errors import AppError, ErrorEntry, load_catalog, to_problem
from starlette.responses import JSONResponse, Response

from learny_api import handlers, pipeline, relay, special  # noqa: F401 - handlers registers roles
from learny_api.contract_files import api_dir
from learny_api.contract_files import inventory_file as _inventory_file
from learny_api.contract_files import ownership_file as _ownership_file
from learny_api.inline_jobs import InlineJobsMiddleware, inline_jobs_options
from learny_api.ownership import (
    Ownership,
    apply_overrides,
    load_ownership,
    overrides_from_env,
    special_key,
    validate_completeness,
)

CATALOG: dict[str, ErrorEntry] = {}


def _load_contract_entries() -> tuple[list[str], list[str]]:
    """Operation ids and special keys of the generated inventory (SPEC-2001)."""
    inventory = json.loads(_inventory_file().read_text(encoding="utf-8"))
    operation_ids = [str(operation["id"]) for operation in inventory["operations"]]
    special_keys = [special_key(str(item["method"]), str(item["path"])) for item in inventory["special"]]
    return operation_ids, special_keys


def load_ownership_checked(settings: Settings) -> Ownership:
    """Loads the ownership table, applies overrides outside production and validates coverage."""
    ownership = load_ownership(_ownership_file())
    if settings.app_env != "test":
        ownership = apply_overrides(ownership, overrides_from_env(settings.ownership_overrides))
    operation_ids, special_keys = _load_contract_entries()
    validate_completeness(ownership, operation_ids, special_keys)
    return ownership


def _problem(code: str, request_id: str) -> JSONResponse:
    """Builds the same problem+json body as the TypeScript backend."""
    problem = to_problem(AppError(code), request_id, CATALOG)
    return JSONResponse(problem, status_code=int(problem["status"]))


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    client = relay.create_client()
    app.state.relay_client = client
    try:
        yield
    finally:
        await client.aclose()


def create_app(
    settings: Settings | None = None,
    *,
    ownership: Ownership | None = None,
    context: pipeline.PipelineContext | None = None,
) -> FastAPI:
    """Builds the facade; `py`-owned operations are registered before the relay catch-all.

    `ownership` and `context` are injectable so a test can serve one operation with fake guards
    without touching the real table or opening a database connection.
    """
    resolved = settings or load_settings()
    global CATALOG
    CATALOG = load_catalog(api_dir() / "errors.json")
    resolved_ownership = ownership or load_ownership_checked(resolved)
    resolved_context = context or pipeline.build_context(build_deps(resolved), resolved, CATALOG)

    app = FastAPI(
        title="Learny API",
        version=resolved.app_version or "dev",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=_lifespan,
    )
    app.state.settings = resolved
    app.state.ownership = resolved_ownership
    app.state.pipeline = resolved_context
    # Tests only: the events a request commits run before it answers (JOBS_MODE=inline).
    inline_jobs = inline_jobs_options(resolved, resolved_context.deps, resolved_ownership)
    if inline_jobs is not None:
        app.add_middleware(InlineJobsMiddleware, **inline_jobs)

    # Special routes first: a development route must refuse before any authentication, and the
    # catch-all relay below only sees what is still `ts` (SPEC-2207).
    special.install(app, resolved_context, resolved_ownership)
    pipeline.install(app, resolved_context, resolved_ownership)

    @app.api_route(
        "/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    )
    async def relay_to_upstream(request: Request) -> Response:
        request_id = request.headers.get("x-request-id", "-")
        try:
            return await relay.forward(
                request,
                request.app.state.relay_client,
                resolved.py_hono_upstream_url,
            )
        except relay.UpstreamUnavailable:
            return _problem("API_UNAVAILABLE", request_id)

    return app


app = create_app()
