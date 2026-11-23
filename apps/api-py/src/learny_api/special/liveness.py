"""Liveness probe of the facade (`GET /health`, conventions section 9, ADR-2042).

The container healthcheck must answer before the database is touched: this probe is always 200 and
only carries the deployment identifiers. The database probe stays `GET /api/v1/health`, which is
allowed to answer 503.
"""

from typing import Any

from fastapi import FastAPI, Request
from learny.shared.health import HEALTH_HEADERS, build_info
from learny.shared.jsonx import dumps
from starlette.responses import Response

from learny_api.pipeline import PipelineContext

LIVENESS_PATH = "/health"
LIVENESS_KEY = "GET /health"


def liveness_body(settings: Any) -> dict[str, Any]:
    """The probe document, in the `{status, version, commit}` field order of the contract."""
    build = build_info({"APP_VERSION": settings.app_version, "GIT_COMMIT": settings.git_commit})
    return {"status": "ok", "version": build.version, "commit": build.commit}


def install(app: FastAPI, context: PipelineContext) -> list[str]:
    """Registers the probe; returns the installed key.

    The route is deliberately named outside the `special:` prefix: it is not an entry of
    `api/inventory.json`, so the coverage test of SPEC-2302 must not count it as a special route.
    The settings are read per request, never at installation.
    """

    async def route(request: Request) -> Response:
        settings = context.deps.settings
        return Response(content=dumps(liveness_body(settings)), headers=dict(HEALTH_HEADERS))

    route.__name__ = "liveness"
    app.add_api_route(
        LIVENESS_PATH,
        route,
        methods=["GET"],
        include_in_schema=False,
        name="liveness",
    )
    return [LIVENESS_KEY]
