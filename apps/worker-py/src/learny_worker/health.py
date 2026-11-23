"""Liveness and readiness of the worker (SPEC-2102, section 9 of the conventions).

The worker exposes these two endpoints on the standard `PORT` for Coolify only; they are not
part of the public contract. `ready` probes the database for two seconds.
"""

import asyncio
from typing import Any

from fastapi import FastAPI
from sqlalchemy import text

PROBE_SECONDS = 2.0


def create_health_app(deps: Any) -> FastAPI:
    """Builds the tiny health application served next to the worker loops."""
    app = FastAPI(title="Learny worker", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready")
    async def ready() -> Any:
        from fastapi.responses import JSONResponse

        try:
            ready_now = await asyncio.wait_for(_probe_database(deps), timeout=PROBE_SECONDS)
        except (TimeoutError, Exception):
            ready_now = False
        if ready_now:
            return {"status": "ready"}
        return JSONResponse({"status": "degraded"}, status_code=503)

    return app


async def _probe_database(deps: Any) -> bool:
    async with deps.db.service_tx() as tx:
        found = await tx.conn.execute(text("select 1 as ok"))
        return bool(found.mappings().all())
