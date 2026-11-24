"""One HTTP POST, as the native push channels need it (SPEC-3501 ET-2, ADR-3007).

APNs speaks HTTP/2 with a provider token, FCM speaks HTTP/1.1 (or 2) with an OAuth token; both send
one JSON document and read a JSON answer. The transport is a plain callable so a test hands over a
fake recorder instead of opening a socket, and the live one never follows a redirection (the push
services do not redirect, and a followed redirect would carry the token elsewhere).
"""

from collections.abc import Awaitable, Callable, Mapping
from typing import Any

import httpx

PUSH_REQUEST_TIMEOUT_SECONDS = 10.0

# `(url, body, headers)` -> `(status code, decoded JSON or None)`; never raises on an HTTP status.
PostJson = Callable[[str, bytes, Mapping[str, str]], Awaitable[tuple[int, Any]]]


async def post_json(url: str, content: bytes, headers: Mapping[str, str]) -> tuple[int, Any]:
    """Posts one JSON document over HTTP/2 and returns the status and the decoded answer."""
    async with httpx.AsyncClient(
        timeout=PUSH_REQUEST_TIMEOUT_SECONDS, follow_redirects=False, http2=True
    ) as client:
        response = await client.post(url, content=content, headers=dict(headers))
    try:
        decoded: Any = response.json()
    except ValueError:
        decoded = None
    return response.status_code, decoded


__all__ = ["PUSH_REQUEST_TIMEOUT_SECONDS", "PostJson", "post_json"]
