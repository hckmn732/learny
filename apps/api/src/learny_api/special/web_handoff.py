"""Hand-off of the mobile session to the web (QA hot fix, 2026-11-25).

`POST /api/v1/auth/web-handoff` requires the caller's access token (Bearer) and answers a
single-use link of the callback that opens the web session of that same account, marked as coming
from the application: the end of the web onboarding then sends the browser back to the app.
"""

from dataclasses import replace
from typing import Any, Final

from fastapi import FastAPI, Request
from learny.identity import public as identity
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import SERVICE_UNAVAILABLE, UNAUTHENTICATED
from pydantic import BaseModel, ConfigDict
from starlette.responses import Response

from learny_api.generated.routes import RouteSpec
from learny_api.pipeline import Call, PipelineContext, handle
from learny_api.special.auth_callback import auth_request

WEB_HANDOFF_ROUTE_ID: Final = "auth.webHandoff"
WEB_HANDOFF_PATH: Final = "/api/v1/auth/web-handoff"


class WebHandoffBody(BaseModel):
    """No input: the link is always for the caller."""

    model_config = ConfigDict(extra="forbid")


class WebHandoffResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str


WEB_HANDOFF_SPEC: Final = RouteSpec(
    id=WEB_HANDOFF_ROUTE_ID,
    method="POST",
    path=WEB_HANDOFF_PATH,
    auth="user",
    rate_limit="default",
    idempotent=False,
    requires_idempotency_key=False,
    fresh_auth=False,
    legal_acceptance=False,
    validation_status=400,
    success_status=200,
    params=None,
    query=None,
    body=WebHandoffBody,
    output=WebHandoffResult,
)


async def create_web_handoff(call: Call) -> dict[str, Any]:
    if call.actor is None:
        raise AppError("UNAUTHENTICATED", UNAUTHENTICATED, status=401)
    app_url = auth_request(call.request, call.deps.settings).app_url
    try:
        url = await identity.web_handoff_url(call.deps, app_url, call.actor.user_id)
    except identity.GoTrueError as error:
        call.deps.logger.warn("web handoff failed", code="SERVICE_UNAVAILABLE", error=str(error))
        raise AppError("SERVICE_UNAVAILABLE", SERVICE_UNAVAILABLE, status=503) from error
    return {"url": url}


def install(app: FastAPI, context: PipelineContext) -> list[str]:
    resolved = (
        context
        if WEB_HANDOFF_ROUTE_ID in context.handlers
        else replace(context, handlers={**context.handlers, WEB_HANDOFF_ROUTE_ID: create_web_handoff})
    )

    async def route(request: Request) -> Response:
        return await handle(WEB_HANDOFF_SPEC, request, resolved)

    route.__name__ = "special_web_handoff"
    app.add_api_route(
        WEB_HANDOFF_PATH,
        route,
        methods=["POST"],
        include_in_schema=False,
        name=f"special:{WEB_HANDOFF_ROUTE_ID}",
    )
    return [WEB_HANDOFF_ROUTE_ID]


__all__ = ["WEB_HANDOFF_PATH", "WEB_HANDOFF_ROUTE_ID", "install"]
