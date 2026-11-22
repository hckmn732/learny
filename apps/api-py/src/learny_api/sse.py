"""AI SDK UI message stream v1 writer (SPEC-2204, 00-conventions section 2).

The route only sets the SSE headers: the framed body comes from `learny.tutor.domain.events`, which
is validated against the TypeScript recording. `StreamingResponse` writes each frame as soon as it
is produced (no buffering), and the generator is cancelled when the client disconnects, so the use
case loses its `finally` hook and never leaves a transaction open.
"""

from collections.abc import AsyncIterable

from starlette.responses import StreamingResponse

STREAM_CONTENT_TYPE = "text/event-stream; charset=utf-8"
SERVED_BY = "learny-api"
UI_MESSAGE_STREAM_VERSION = "v1"
STREAM_HEADERS = {
    "content-type": STREAM_CONTENT_TYPE,
    "cache-control": "no-store",
    "x-vercel-ai-ui-message-stream": UI_MESSAGE_STREAM_VERSION,
}


def stream_response(frames: AsyncIterable[str], request_id: str) -> StreamingResponse:
    """One `text/event-stream` response carrying the ordered frames of a use case."""
    headers = dict(STREAM_HEADERS)
    headers["x-request-id"] = request_id
    headers["x-served-by"] = SERVED_BY

    async def body() -> AsyncIterable[bytes]:
        async for frame in frames:
            yield frame.encode("utf-8")

    return StreamingResponse(body(), status_code=200, headers=headers)
