"""The e-mailed link callback (SPEC-202, EF-6, ADR-0121).

The route is native, not a pipeline operation: any failure, including an unreadable query, still
answers the same 302 to the invalid-link page (CL-1), and the session cookies written by the
verification travel with that redirect.
"""

from typing import Any, cast

from fastapi import FastAPI, Request
from learny.identity import public as identity
from learny.shared.errors import AppError
from starlette.responses import Response

from learny_api.generated.models import AuthCallbackQuery
from learny_api.generated.routes import ROUTES_BY_ID, RouteSpec
from learny_api.pipeline import (
    API_REQUEST_ID_HEADER,
    SERVED_BY,
    SERVER_TIMING,
    PipelineContext,
    resolve_api_request_id,
)
from learny_api.validate import query_to_object, validate_input

CALLBACK_ROUTE_ID = "auth.callback"
CALLBACK_PATH = "/api/v1/auth/callback"


def auth_request(request: Request, settings: Any) -> identity.AuthRequest:
    """The request-scoped values of one authentication call, from the settings and the URL."""
    origin = f"{request.url.scheme}://{request.url.netloc}"
    app_url = settings.next_public_app_url or origin
    return identity.AuthRequest(
        app_url=app_url,
        secure=not identity.is_local_host(request.url.hostname or ""),
        cookies=identity.parse_cookie_header(request.headers.get("cookie")),
    )


def _query(spec: RouteSpec, request: Request) -> AuthCallbackQuery | None:
    """`CallbackQuery.safeParse`: an unreadable query is the invalid-link page, never a 400."""
    if spec.query is None:
        return None
    try:
        validated = validate_input(
            spec.query,
            query_to_object(request.query_params.multi_items()),
            "query",
            status=spec.validation_status,
            route_id=spec.id,
        )
    except AppError:
        return None
    return cast(AuthCallbackQuery, validated)


async def callback_response(request: Request, deps: Any, request_id: str) -> Response:
    """The 302 of the callback: `location`, `no-store`, the session cookies and the timing."""
    started = deps.clock.now()
    spec = ROUTES_BY_ID[CALLBACK_ROUTE_ID]
    headers: list[tuple[str, str]] = []

    def emit(header: str) -> None:
        headers.append(("set-cookie", header))

    destination = identity.INVALID_LINK_DESTINATION
    query = _query(spec, request)
    if query is not None:
        auth = auth_request(request, deps.settings)
        destination = await identity.complete_verification(
            deps,
            auth,
            token_hash=query.token_hash,
            kind=str(query.type),
            next_path=query.next,
            next_cookie=auth.cookies.get(identity.NEXT_COOKIE),
            emit=emit,
        )
    elapsed = deps.clock.now() - started
    response = Response(
        status_code=302,
        headers={
            "location": destination,
            "cache-control": "no-store",
            API_REQUEST_ID_HEADER: request_id,
        },
    )
    for name, value in headers:
        response.headers.append(name, value)
    response.headers["server-timing"] = SERVER_TIMING.format(
        duration=max(0, int(elapsed.total_seconds() * 1000))
    )
    response.headers[SERVED_BY_HEADER] = SERVED_BY
    return response


SERVED_BY_HEADER = "x-served-by"


async def endpoint(request: Request, context: PipelineContext) -> Response:
    """The special route entry point."""
    request_id = resolve_api_request_id(request.headers.get(API_REQUEST_ID_HEADER))
    return await callback_response(request, context.deps, request_id)


def install(app: FastAPI, context: PipelineContext) -> list[str]:
    """Registers the callback route; returns the installed route id."""
    app.add_api_route(
        CALLBACK_PATH,
        _handler(request_context=context),
        methods=["GET"],
        include_in_schema=False,
        name=f"special:{CALLBACK_ROUTE_ID}",
    )
    return [CALLBACK_ROUTE_ID]


def _handler(request_context: PipelineContext) -> Any:
    async def route(request: Request) -> Response:
        return await endpoint(request, request_context)

    route.__name__ = "special_auth_callback"
    return route


__all__ = ["CALLBACK_PATH", "CALLBACK_ROUTE_ID", "callback_response", "install"]
