"""Transparent relay to the Hono upstream (ADR-2005, P20 plan step 5, spikes.md section A).

Every entry owned by `ts` reaches the upstream untouched: same method, path, query, headers and
body, and the response is streamed back with its raw headers so that several `Set-Cookie` headers
survive (Starlette drops duplicates when given a mapping).
"""

from collections.abc import AsyncIterator, Iterable, Mapping

import httpx
from fastapi import Request
from starlette.responses import StreamingResponse

HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "host",
        "content-length",
    }
)

REQUEST_TIMEOUT = httpx.Timeout(connect=2.0, read=None, write=30.0, pool=5.0)


class UpstreamUnavailable(RuntimeError):
    """The Hono upstream refused the connection or timed out on connect."""


def forwarded_headers(headers: Mapping[str, str] | Iterable[tuple[str, str]]) -> list[tuple[str, str]]:
    """Drops hop-by-hop and `host` headers; everything else is forwarded as is."""
    items = headers.items() if isinstance(headers, Mapping) else headers
    return [(name, value) for name, value in items if name.lower() not in HOP_BY_HOP]


def upstream_url(upstream: str, path: str, query: str) -> str:
    """`http://upstream` + `/api/v1/...` + `?query`."""
    url = f"{upstream.rstrip('/')}{path}"
    return f"{url}?{query}" if query else url


def raw_response_headers(headers: Iterable[tuple[str, str]]) -> list[tuple[bytes, bytes]]:
    """Keep every header, duplicates included, so `Set-Cookie` is never collapsed."""
    return [(name.lower().encode("latin-1"), value.encode("latin-1")) for name, value in headers]


def create_client() -> httpx.AsyncClient:
    """Client shared by the whole app; `follow_redirects` stays off to relay 302 as is."""
    return httpx.AsyncClient(timeout=REQUEST_TIMEOUT, follow_redirects=False)


async def forward(
    request: Request,
    client: httpx.AsyncClient,
    upstream: str,
) -> StreamingResponse:
    """Relays one request and streams the upstream response back."""
    body = await request.body()
    target = upstream_url(upstream, request.url.path, request.url.query)
    headers = forwarded_headers(request.headers)
    upstream_request = client.build_request(request.method, target, headers=headers, content=body)
    try:
        response = await client.send(upstream_request, stream=True)
    except httpx.ConnectError as error:
        raise UpstreamUnavailable(str(error)) from error
    except httpx.TimeoutException as error:
        raise UpstreamUnavailable(str(error)) from error

    async def chunks() -> AsyncIterator[bytes]:
        try:
            # A buffered transport (tests, some proxies) delivers the body with the response.
            if response.is_stream_consumed:
                yield response.content
            else:
                async for chunk in response.aiter_raw():
                    yield chunk
        finally:
            await response.aclose()

    relayed = StreamingResponse(chunks(), status_code=response.status_code)
    relayed.raw_headers = raw_response_headers(response.headers.multi_items())
    return relayed
