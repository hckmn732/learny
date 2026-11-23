"""Special routes of the facade (SPEC-2207, port of `packages/api-routes/src/special`).

Every route that does not follow the generic contract pipeline is registered here, before the
pipeline. Two families live here:

- the development routes of the SDD harness (`special/dev-routes.ts`): the same twelve steps as a
  normal operation, behind the development guard of `devOnly` (SPEC-201 ET-7, CL-10), which answers
  the problem+json 404 of the TypeScript handler before any authentication;
- the remaining special routes of the inventory (health probe, auth callback and sprint planning),
  each with the guard and the answer shape of its TypeScript counterpart.
"""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request
from starlette.responses import Response

from learny_api import pipeline
from learny_api.generated.routes import ROUTES_BY_ID, RouteSpec
from learny_api.pipeline import PipelineContext
from learny_api.special import auth_callback, sprints
from learny_api.special.guards import dev_routes_enabled, not_found_problem, sdd_pages_enabled

# SPEC-2207 - the `dev.*` operations whose path is also a special route of the inventory. The
# development guard of `devRoute` wraps their pipeline, so they are installed here, not by
# `pipeline.install`.
DEVELOPMENT_ROUTE_IDS: tuple[str, ...] = (
    "dev.email.outbox",
    "dev.email.outbox.purge",
    "dev.events.demo.run",
    "dev.events.demo.start",
    "dev.notificationsGenerate",
    "dev.stripe.checkoutCancel",
    "dev.stripe.checkoutPay",
    "dev.stripe.simulate",
)

# SPEC-2207 - the special routes of the inventory that traverse the whole pipeline without a
# development guard. `GET /api/v1/health` is public, exempt from the rate limiter and answers the
# non-JSON contract of SPEC-006 EF-2 through its handler, so the pipeline only adds its headers.
UNGATED_ROUTE_IDS: tuple[str, ...] = ("health.get",)

# Every route the special registry owns, so `pipeline.install` never registers it twice.
SPECIAL_ROUTE_IDS: tuple[str, ...] = (
    *DEVELOPMENT_ROUTE_IDS,
    *UNGATED_ROUTE_IDS,
    auth_callback.CALLBACK_ROUTE_ID,
    sprints.SPRINTS_ROUTE_ID,
)


def install(app: FastAPI, context: PipelineContext) -> list[str]:
    """Registers every special route of the inventory; returns the installed route ids."""
    installed = _install_guarded_developments(app, context)
    installed += _install_ungated(app, context)
    installed += auth_callback.install(app, context)
    installed += sprints.install(app, context)
    return installed


def _install_guarded_developments(app: FastAPI, context: PipelineContext) -> list[str]:
    installed: list[str] = []
    for route_id in DEVELOPMENT_ROUTE_IDS:
        spec = ROUTES_BY_ID[route_id]
        app.add_api_route(
            spec.path,
            _guarded_endpoint(spec, context),
            methods=[spec.method],
            include_in_schema=False,
            name=f"special:{route_id}",
        )
        installed.append(route_id)
    return installed


def _install_ungated(app: FastAPI, context: PipelineContext) -> list[str]:
    installed: list[str] = []
    for route_id in UNGATED_ROUTE_IDS:
        spec = ROUTES_BY_ID[route_id]
        app.add_api_route(
            spec.path,
            _plain_endpoint(spec, context),
            methods=[spec.method],
            include_in_schema=False,
            name=f"special:{route_id}",
        )
        installed.append(route_id)
    return installed


def _guarded_endpoint(spec: RouteSpec, context: PipelineContext) -> Callable[[Request], Awaitable[Response]]:
    async def endpoint(request: Request) -> Response:
        if not dev_routes_enabled(context.env):
            return not_found_problem(request, context)
        return await pipeline.handle(spec, request, context)

    endpoint.__name__ = f"special_{spec.id.replace('.', '_')}"
    return endpoint


def _plain_endpoint(spec: RouteSpec, context: PipelineContext) -> Callable[[Request], Awaitable[Response]]:
    async def endpoint(request: Request) -> Response:
        return await pipeline.handle(spec, request, context)

    endpoint.__name__ = f"special_{spec.id.replace('.', '_')}"
    return endpoint


__all__ = [
    "DEVELOPMENT_ROUTE_IDS",
    "SPECIAL_ROUTE_IDS",
    "UNGATED_ROUTE_IDS",
    "dev_routes_enabled",
    "install",
    "sdd_pages_enabled",
]
