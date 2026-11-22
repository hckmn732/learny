"""Special routes of the facade (SPEC-2207, port of `packages/api-routes/src/special`).

Every route that does not follow the generic contract pipeline is registered here, before the
pipeline and before the relay catch-all. This first slice ports the development routes
(`special/dev-routes.ts`): the same twelve steps as a normal operation, behind the development guard
of `devOnly` (SPEC-201 ET-7, CL-10). Outside `ENABLE_SDD_PAGES`, or in production, the route answers
the same problem+json 404 as the TypeScript handler, before any authentication.
"""

from collections.abc import Awaitable, Callable, Mapping
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND
from learny.shared.ownership import special_key
from starlette.responses import Response

from learny_api import pipeline
from learny_api.generated.routes import ROUTES_BY_ID, RouteSpec
from learny_api.pipeline import PipelineContext, api_problem_response, resolve_api_request_id

if TYPE_CHECKING:
    from learny.shared.ownership import Ownership

# SPEC-2207 - the `dev.*` operations whose path is also a special route of the inventory. The
# development guard of `devRoute` wraps their pipeline, so they are installed here, not by
# `pipeline.install`.
DEVELOPMENT_ROUTE_IDS: tuple[str, ...] = (
    "dev.cron.hourlyTick",
    "dev.echo",
    "dev.email.outbox",
    "dev.email.outbox.purge",
    "dev.email.preview",
    "dev.email.send",
    "dev.events.demo.run",
    "dev.events.demo.start",
    "dev.events.outbox",
    "dev.items",
    "dev.notificationsGenerate",
    "dev.notify",
    "dev.personal-data.deletion.cancel",
    "dev.personal-data.deletion.schedule",
    "dev.personal-data.execute",
    "dev.personal-data.export",
    "dev.pushSend",
    "dev.rateLimit.burst",
    "dev.rateLimit.origin",
    "dev.rateLimit.purge",
    "dev.stripe.checkoutCancel",
    "dev.stripe.checkoutPay",
    "dev.stripe.events",
    "dev.stripe.simulate",
    "dev.uploadSimulation",
)


def dev_routes_enabled(env: Mapping[str, str | None]) -> bool:
    """`devRoutesEnabled`: only the exact values `true` and `1` open the routes, never production."""
    flag = env.get("ENABLE_SDD_PAGES")
    return flag in ("true", "1") and env.get("APP_ENV") != "production"


def install(app: FastAPI, context: PipelineContext, ownership: "Ownership") -> list[str]:
    """Registers every `py`-owned development route; returns the installed route ids."""
    installed: list[str] = []
    for route_id in DEVELOPMENT_ROUTE_IDS:
        spec = ROUTES_BY_ID[route_id]
        if ownership.special.get(special_key(spec.method, spec.path)) != "py":
            continue
        app.add_api_route(
            spec.path,
            _endpoint(spec, context),
            methods=[spec.method],
            include_in_schema=False,
            name=f"special:{route_id}",
        )
        installed.append(route_id)
    return installed


def _dev_disabled(request: Request, context: PipelineContext) -> Response:
    """`devOnly` refusal: the same problem+json 404 as the TypeScript guard, no extra header."""
    request_id = resolve_api_request_id(request.headers.get(pipeline.API_REQUEST_ID_HEADER))
    return api_problem_response(AppError("NOT_FOUND", RESOURCE_NOT_FOUND), request_id, dict(context.catalog))


def _endpoint(spec: RouteSpec, context: PipelineContext) -> Callable[[Request], Awaitable[Response]]:
    async def endpoint(request: Request) -> Response:
        if not dev_routes_enabled(context.env):
            return _dev_disabled(request, context)
        return await pipeline.handle(spec, request, context)

    endpoint.__name__ = f"special_{spec.id.replace('.', '_')}"
    return endpoint


__all__ = ["DEVELOPMENT_ROUTE_IDS", "dev_routes_enabled", "install"]
