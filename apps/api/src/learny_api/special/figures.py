"""Figures of a deposited document (QA 2026-11-26).

`GET /api/v1/resources/{rid}/figures/{n}` streams one figure of the caller's own resource: the
image a course shows next to its text. The whole pipeline runs (authentication by cookie or Bearer,
rate limit); another learner's figure is a 404, like a missing one.
"""

from dataclasses import replace
from typing import Annotated, Any, Final, cast

from fastapi import FastAPI, Request
from learny.content import public as content
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import FIGURE_NOT_FOUND, UNAUTHENTICATED
from pydantic import BaseModel, Field, StringConstraints
from starlette.responses import Response

from learny_api.generated.routes import RouteSpec
from learny_api.pipeline import Call, PipelineContext, handle

FIGURE_ROUTE_ID: Final = "resources.figure"
FIGURE_PATH: Final = "/api/v1/resources/{rid}/figures/{n}"

Uuid = Annotated[
    str,
    StringConstraints(
        pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
    ),
]


class FigureParams(BaseModel):
    rid: Uuid
    n: int = Field(ge=0, le=1000)


class FigureOutput(BaseModel):
    """Never validated: the handler answers the image itself."""


FIGURE_SPEC: Final = RouteSpec(
    id=FIGURE_ROUTE_ID,
    method="GET",
    path=FIGURE_PATH,
    auth="user",
    rate_limit="default",
    idempotent=False,
    requires_idempotency_key=False,
    fresh_auth=False,
    legal_acceptance=False,
    validation_status=400,
    success_status=200,
    params=FigureParams,
    query=None,
    body=None,
    output=FigureOutput,
)


async def get_figure(call: Call) -> Response:
    if call.actor is None:
        raise AppError("UNAUTHENTICATED", UNAUTHENTICATED, status=401)
    params = cast(dict[str, Any], cast(Any, call.params).model_dump())
    found = await content.owned_figure(call.deps, call.actor.user_id, str(params["rid"]), int(params["n"]))
    if found is None:
        raise AppError("NOT_FOUND", FIGURE_NOT_FOUND, status=404)
    data, mime = found
    return Response(
        content=data,
        media_type=mime,
        headers={"cache-control": "private, max-age=86400", "x-content-type-options": "nosniff"},
    )


def install(app: FastAPI, context: PipelineContext) -> list[str]:
    resolved = (
        context
        if FIGURE_ROUTE_ID in context.handlers
        else replace(context, handlers={**context.handlers, FIGURE_ROUTE_ID: get_figure})
    )

    async def route(request: Request) -> Response:
        return await handle(FIGURE_SPEC, request, resolved)

    route.__name__ = "special_figure"
    app.add_api_route(
        FIGURE_PATH,
        route,
        methods=["GET"],
        include_in_schema=False,
        name=f"special:{FIGURE_ROUTE_ID}",
    )
    return [FIGURE_ROUTE_ID]


__all__ = ["FIGURE_PATH", "FIGURE_ROUTE_ID", "install"]
