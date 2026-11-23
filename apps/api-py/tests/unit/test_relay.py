"""[SPEC-2003] Transparent relay to Hono (ADR-2005)."""

from typing import Any

import httpx
import pytest
from learny_api import relay
from starlette.requests import Request

pytestmark = pytest.mark.spec("SPEC-2003")


def make_request(
    method: str,
    path: str,
    query: str = "",
    body: bytes = b"",
    headers: dict[str, str] | None = None,
) -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode(),
        "query_string": query.encode(),
        "headers": [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()],
        "server": ("test", 80),
        "client": ("test", 1),
        "scheme": "http",
        "root_path": "",
    }
    sent = False

    async def receive() -> Any:
        nonlocal sent
        if sent:
            return {"type": "http.disconnect"}
        sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(scope, receive)


def test_forwarded_headers_drop_hop_by_hop_and_host() -> None:
    headers = {
        "host": "facade",
        "connection": "keep-alive",
        "content-length": "3",
        "cookie": "sb-access-token=abc",
        "x-request-id": "r-1",
    }
    assert relay.forwarded_headers(headers) == [
        ("cookie", "sb-access-token=abc"),
        ("x-request-id", "r-1"),
    ]


def test_upstream_url_keeps_the_query_string() -> None:
    assert relay.upstream_url("http://up/", "/api/v1/x", "a=1") == "http://up/api/v1/x?a=1"
    assert relay.upstream_url("http://up", "/api/v1/x", "") == "http://up/api/v1/x"


def test_raw_response_headers_keep_duplicates() -> None:
    raw = relay.raw_response_headers([("set-cookie", "a=1"), ("set-cookie", "b=2")])
    assert raw == [(b"set-cookie", b"a=1"), (b"set-cookie", b"b=2")]


async def test_forward_relays_status_body_and_every_cookie() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert str(request.url) == "http://upstream/api/v1/x?y=1"
        assert request.content == b'{"a":1}'
        assert request.headers["x-request-id"] == "r-1"
        return httpx.Response(
            201,
            headers=[("set-cookie", "a=1; Path=/"), ("set-cookie", "b=2; Path=/")],
            content=b'{"ok":true}',
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    request = make_request(
        "POST",
        "/api/v1/x",
        query="y=1",
        body=b'{"a":1}',
        headers={"x-request-id": "r-1", "host": "facade"},
    )

    response = await relay.forward(request, client, "http://upstream")

    assert response.status_code == 201
    cookies = [value for name, value in response.raw_headers if name == b"set-cookie"]
    assert cookies == [b"a=1; Path=/", b"b=2; Path=/"]
    chunks: list[bytes] = []
    async for chunk in response.body_iterator:
        chunks.append(chunk.encode() if isinstance(chunk, str) else bytes(chunk))
    body = b"".join(chunks)
    assert body == b'{"ok":true}'


async def test_forward_reports_an_unreachable_upstream() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    with pytest.raises(relay.UpstreamUnavailable):
        await relay.forward(make_request("GET", "/health"), client, "http://upstream")
