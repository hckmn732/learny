"""The relay stream of the SDD harness (port of `special/relay-stream.ts`).

`GET /api/v1/dev/sdd/relay-stream` is the three-fragment `text/event-stream` that proves the facade
streams without buffering. It is behind the development guard, like every demonstration route.
"""

import asyncio
from collections.abc import AsyncIterable, Awaitable, Callable
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request
from starlette.responses import Response, StreamingResponse

from learny_api.pipeline import PipelineContext
from learny_api.special.guards import dev_routes_enabled, not_found_problem

if TYPE_CHECKING:
    from learny.shared.ownership import Ownership

RELAY_STREAM_PATH = "/api/v1/dev/sdd/relay-stream"
RELAY_STREAM_KEY = "GET /api/v1/dev/sdd/relay-stream"
RELAY_FRAGMENT_COUNT = 3
RELAY_FRAGMENT_DELAY_SECONDS = 0.025
RELAY_STREAM_HEADERS = {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
}


async def fragments(count: int = RELAY_FRAGMENT_COUNT) -> AsyncIterable[bytes]:
    """The ordered `data: fragment-N` frames, one every 25 ms, the last one closing the stream."""
    for index in range(1, count + 1):
        yield f"data: fragment-{index}\n\n".encode()
        if index < count:
            await asyncio.sleep(RELAY_FRAGMENT_DELAY_SECONDS)


async def stream(request: Request, context: PipelineContext) -> Response:
    """Answers the guarded stream, or the problem+json 404 of `devOnly`."""
    if not dev_routes_enabled(context.env):
        return not_found_problem(request, context)
    return StreamingResponse(fragments(), status_code=200, headers=dict(RELAY_STREAM_HEADERS))


def install(app: FastAPI, context: PipelineContext, ownership: "Ownership") -> list[str]:
    """Registers the `py`-owned relay stream; returns the installed special keys."""
    if ownership.special.get(RELAY_STREAM_KEY) != "py":
        return []
    app.add_api_route(
        RELAY_STREAM_PATH,
        _endpoint(context),
        methods=["GET"],
        include_in_schema=False,
        name="special:relayStream",
    )
    return [RELAY_STREAM_KEY]


def _endpoint(context: PipelineContext) -> Callable[[Request], Awaitable[Response]]:
    async def endpoint(request: Request) -> Response:
        return await stream(request, context)

    endpoint.__name__ = "special_relay_stream"
    return endpoint
