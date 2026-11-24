"""Guards of the special routes.

Both refuse `APP_ENV=production`.
"""

from collections.abc import Mapping

from fastapi import Request
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND
from starlette.responses import Response

from learny_api import pipeline
from learny_api.pipeline import api_problem_response, resolve_api_request_id


def dev_routes_enabled(env: Mapping[str, str | None]) -> bool:
    """`devRoutesEnabled`: only the exact values `true` and `1` open the routes, never production."""
    flag = env.get("ENABLE_SDD_PAGES")
    return flag in ("true", "1") and env.get("APP_ENV") != "production"


def sdd_pages_enabled(env: Mapping[str, str | None]) -> bool:
    """`sddPagesEnabled`: the `_dev` tooling endpoints open on the exact value `true` only."""
    return env.get("ENABLE_SDD_PAGES") == "true" and env.get("APP_ENV") != "production"


def not_found_problem(request: Request, context: "pipeline.PipelineContext") -> Response:
    """`devOnly` refusal: the same problem+json 404."""
    request_id = resolve_api_request_id(request.headers.get(pipeline.API_REQUEST_ID_HEADER))
    return api_problem_response(AppError("NOT_FOUND", RESOURCE_NOT_FOUND), request_id, dict(context.catalog))


def empty_not_found() -> Response:
    """The bare 404 of the `_dev` tooling endpoints (`new Response(null, {status: 404})`)."""
    return Response(status_code=404)
