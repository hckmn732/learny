"""HTTP handler of the health probe (SPEC-2207, port of `special/health.ts`).

The probe is the only `py` operation whose answer is not a contract document: the handler returns
the `Response` of SPEC-006 EF-2, so the pipeline adds the request id, the timing and the
`x-served-by` header exactly like the TypeScript `routeHandler` does for a direct response.
"""

from typing import Any

from learny.shared.health import HEALTH_HEADERS, get_health
from learny.shared.jsonx import dumps
from starlette.responses import Response

from learny_api.pipeline import Call, handler


def health_env(settings: Any) -> dict[str, str | None]:
    """The two deployment identifiers the probe reads, like `buildInfo(process.env)`."""
    return {"APP_VERSION": settings.app_version, "GIT_COMMIT": settings.git_commit}


@handler("health.get")
async def health_get(call: Call) -> Any:
    """`GET /api/v1/health`: the probe document, 503 only when the database is unavailable."""
    settings = call.deps.settings
    query = call.deps.db.ping if settings.database_configured else None
    status, body = await get_health(query, health_env(settings))
    return Response(content=dumps(body), status_code=status, headers=dict(HEALTH_HEADERS))
