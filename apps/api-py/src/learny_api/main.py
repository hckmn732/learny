"""FastAPI facade of the Learny API (SPEC-2003, ADR-2005, ADR-2012).

The facade serves every operation the contract declares: `pipeline.install` registers the
operations of `learny_api.generated.routes`, `special.install` registers the routes outside the
generic pipeline. There is no fallback: a path the table does not declare answers the 404 of
Starlette, which is the behaviour of the TypeScript backend for an unknown route (SPEC-2302).
"""

from fastapi import FastAPI
from learny.shared.config import Settings, load_settings
from learny.shared.deps import build_deps
from learny.shared.errors import ErrorEntry, load_catalog

from learny_api import handlers, pipeline, special  # noqa: F401 - handlers registers roles
from learny_api.contract_files import api_dir
from learny_api.inline_jobs import InlineJobsMiddleware, inline_jobs_options

CATALOG: dict[str, ErrorEntry] = {}


def create_app(
    settings: Settings | None = None,
    *,
    context: pipeline.PipelineContext | None = None,
) -> FastAPI:
    """Builds the facade and registers every route of the contract once.

    `context` is injectable so a test can serve operations with fake guards without opening a
    database connection; the real context is built from the settings at startup.
    """
    resolved = settings or load_settings()
    global CATALOG
    CATALOG = load_catalog(api_dir() / "errors.json")
    resolved_context = context or pipeline.build_context(build_deps(resolved), resolved, CATALOG)

    app = FastAPI(
        title="Learny API",
        version=resolved.app_version or "dev",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = resolved
    app.state.pipeline = resolved_context
    # Tests only: the events a request commits run before it answers (JOBS_MODE=inline).
    inline_jobs = inline_jobs_options(resolved, resolved_context.deps)
    if inline_jobs is not None:
        app.add_middleware(InlineJobsMiddleware, **inline_jobs)

    # Special routes first: a development route must refuse before any authentication (SPEC-2207).
    special.install(app, resolved_context)
    pipeline.install(app, resolved_context)

    return app


app = create_app()
