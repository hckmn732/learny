"""FastAPI facade of the Learny API (SPEC-2003, ADR-2005, ADR-2012).

The facade serves every operation the contract declares: `pipeline.install` registers the
operations of `learny_api.generated.routes`, `special.install` registers the routes outside the
generic pipeline. There is no fallback: a path the table does not declare answers the 404 of
Starlette, which is the behaviour of the TypeScript backend for an unknown route (SPEC-2302).
"""

import json

from fastapi import FastAPI
from learny.shared.config import Settings, load_settings
from learny.shared.deps import build_deps
from learny.shared.errors import ErrorEntry, load_catalog

from learny_api import handlers, pipeline, special  # noqa: F401 - handlers registers roles
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


def create_app(
    settings: Settings | None = None,
    *,
    ownership: Ownership | None = None,
    context: pipeline.PipelineContext | None = None,
) -> FastAPI:
    """Builds the facade and registers every route of the contract once.

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
    )
    app.state.settings = resolved
    app.state.ownership = resolved_ownership
    app.state.pipeline = resolved_context
    # Tests only: the events a request commits run before it answers (JOBS_MODE=inline).
    inline_jobs = inline_jobs_options(resolved, resolved_context.deps, resolved_ownership)
    if inline_jobs is not None:
        app.add_middleware(InlineJobsMiddleware, **inline_jobs)

    # Special routes first: a development route must refuse before any authentication (SPEC-2207).
    special.install(app, resolved_context, resolved_ownership)
    pipeline.install(app, resolved_context, resolved_ownership)

    return app


app = create_app()
