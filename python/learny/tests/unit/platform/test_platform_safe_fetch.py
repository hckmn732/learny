"""[SPEC-2203] Anti-SSRF guard, robots.txt and bounds of the safe retrieval.

No test opens a socket, the transport is injected and the DNS seam resolves a fixed public address.
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import pytest
from learny.platform.safe_fetch import (
    SafeFetchOptions,
    SafeFetchRequest,
    SafeFetchResponse,
    clear_robots_cache,
    is_allowed_by_robots,
    is_blocked_ip,
    is_blocked_ipv4,
    is_blocked_ipv6,
    parse_ipv6,
    resolve_public_url,
    safe_fetch,
)
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-2203")

PUBLIC = (("93.184.216.34", 4),)


def public_lookup(addresses: tuple[tuple[str, int], ...] = PUBLIC) -> Any:
    async def lookup(_hostname: str) -> Any:
        from learny.platform.safe_fetch import ResolvedAddress

        return tuple(ResolvedAddress(address=address, family=family) for address, family in addresses)

    return lookup


def response(status: int, headers: dict[str, str] | None = None, text: str = "") -> SafeFetchResponse:
    async def body() -> AsyncIterator[bytes]:
        if text:
            yield text.encode()

    return SafeFetchResponse(status=status, headers=headers or {}, body=body())


def recording_transport(calls: list[SafeFetchRequest], answer: Any) -> Any:
    async def transport(request: SafeFetchRequest) -> SafeFetchResponse:
        calls.append(request)
        result: SafeFetchResponse = await answer(request)
        return result

    return transport


async def test_the_connection_is_pinned_on_the_verified_address() -> None:
    calls: list[SafeFetchRequest] = []

    async def answer(_request: SafeFetchRequest) -> SafeFetchResponse:
        return response(200, {"content-type": "text/html"}, "<p>ok</p>")

    result = await safe_fetch(
        "https://example.test/article",
        SafeFetchOptions(
            lookup=public_lookup(), respect_robots=False, transport=recording_transport(calls, answer)
        ),
    )

    assert result.url == "https://example.test/article"
    assert result.content_type == "text/html"
    assert result.body == b"<p>ok</p>"
    assert len(calls) == 1
    assert calls[0].address is not None
    assert calls[0].address.address == "93.184.216.34"


async def test_a_private_literal_is_refused_before_any_request() -> None:
    calls: list[SafeFetchRequest] = []

    async def answer(_request: SafeFetchRequest) -> SafeFetchResponse:
        raise AssertionError("no request may be made")

    with pytest.raises(AppError) as error:
        await safe_fetch(
            "https://127.0.0.1/secret",
            SafeFetchOptions(transport=recording_transport(calls, answer)),
        )
    assert error.value.code == "URL_BLOCKED_HOST"
    assert calls == []


async def test_a_redirect_to_a_private_address_is_refused_before_the_second_request() -> None:
    calls: list[SafeFetchRequest] = []

    async def answer(request: SafeFetchRequest) -> SafeFetchResponse:
        if request.url.host == "example.test":
            return response(302, {"location": "https://127.0.0.1/admin"})
        raise AssertionError("the private hop must never be requested")

    with pytest.raises(AppError) as error:
        await safe_fetch(
            "https://example.test/go",
            SafeFetchOptions(
                lookup=public_lookup(), respect_robots=False, transport=recording_transport(calls, answer)
            ),
        )
    assert error.value.code == "URL_BLOCKED_HOST"
    assert [request.url.href for request in calls] == ["https://example.test/go"]


async def test_a_dns_rebind_towards_a_private_address_is_refused() -> None:
    lookups = 0
    calls: list[SafeFetchRequest] = []
    from learny.platform.safe_fetch import ResolvedAddress

    async def lookup(_hostname: str) -> Any:
        nonlocal lookups
        lookups += 1
        address = "93.184.216.34" if lookups == 1 else "10.0.0.7"
        return (ResolvedAddress(address=address, family=4),)

    async def answer(_request: SafeFetchRequest) -> SafeFetchResponse:
        return response(302, {"location": "https://rebind.test/next"})

    with pytest.raises(AppError) as error:
        await safe_fetch(
            "https://rebind.test/start",
            SafeFetchOptions(
                lookup=lookup, respect_robots=False, transport=recording_transport(calls, answer)
            ),
        )
    assert error.value.code == "URL_BLOCKED_HOST"
    assert len(calls) == 1
    assert lookups == 2


async def test_the_protocol_and_the_credentials_are_refused() -> None:
    with pytest.raises(AppError) as file_error:
        await safe_fetch("file:///etc/passwd")
    assert file_error.value.code == "URL_INVALID"
    with pytest.raises(AppError) as credential_error:
        await safe_fetch("https://user:secret@example.test/")
    assert credential_error.value.code == "URL_INVALID"


async def test_a_disallow_rule_for_learnybot_is_honoured() -> None:
    clear_robots_cache()
    calls: list[str] = []

    async def transport(request: SafeFetchRequest) -> SafeFetchResponse:
        calls.append(request.url.path)
        if request.url.path == "/robots.txt":
            return response(200, {"content-type": "text/plain"}, "User-agent: *\nDisallow: /private")
        return response(200, {}, "<p>content</p>")

    with pytest.raises(AppError) as error:
        await safe_fetch(
            "https://robots.test/private/page", SafeFetchOptions(lookup=public_lookup(), transport=transport)
        )
    assert error.value.code == "WEB_ROBOTS_DISALLOWED"
    assert calls == ["/robots.txt"]


def test_the_longest_allow_rule_wins() -> None:
    text = "User-agent: *\nDisallow: /docs\nAllow: /docs/public"

    assert is_allowed_by_robots("LearnyBot/1.0", "/docs/public/page", text) is True
    assert is_allowed_by_robots("LearnyBot/1.0", "/docs/private", text) is False
    assert is_allowed_by_robots("LearnyBot/1.0", "/blog", text) is True


def test_the_robots_grammar_ignores_comments_and_agentless_rules() -> None:
    text = "\n".join(
        [
            "# comment",
            "line without separator",
            "Disallow: /orphan",
            "User-agent: learnybot # agent",
            "Disallow:",
            "Allow: /ok",
        ]
    )

    assert is_allowed_by_robots("LearnyBot/1.0", "/orphan", text) is True
    assert is_allowed_by_robots("LearnyBot/1.0", "/ok", text) is True


def test_a_new_group_opens_after_rules_and_an_agent_without_rule_allows() -> None:
    text = "\n".join(
        [
            "User-agent: *",
            "Disallow: /prive",
            "User-agent: learnybot",
            "Disallow: /secret$",
            "Disallow: /img/*.png",
        ]
    )

    assert is_allowed_by_robots("LearnyBot/1.0", "/prive", text) is False
    assert is_allowed_by_robots("LearnyBot/1.0", "/secret", text) is False
    assert is_allowed_by_robots("LearnyBot/1.0", "/secret/plus", text) is True
    assert is_allowed_by_robots("LearnyBot/1.0", "/img/a.png", text) is False
    assert is_allowed_by_robots("LearnyBot/1.0", "/public", text) is True
    assert is_allowed_by_robots("Autre/2.0", "/prive", text) is False


async def test_redirects_are_bounded() -> None:
    calls = 0

    async def transport(_request: SafeFetchRequest) -> SafeFetchResponse:
        nonlocal calls
        calls += 1
        return response(302, {"location": "/loop"})

    with pytest.raises(AppError) as error:
        await safe_fetch(
            "https://example.test/loop",
            SafeFetchOptions(
                lookup=public_lookup(), respect_robots=False, max_redirects=2, transport=transport
            ),
        )
    assert error.value.code == "FETCH_TOO_MANY_REDIRECTS"
    assert calls == 3


async def test_the_total_deadline_is_bounded() -> None:
    calls = 0

    async def transport(_request: SafeFetchRequest) -> SafeFetchResponse:
        nonlocal calls
        calls += 1
        await asyncio.sleep(5)
        raise AssertionError("unreachable")

    with pytest.raises(AppError) as error:
        await safe_fetch(
            "https://example.test/slow",
            SafeFetchOptions(
                lookup=public_lookup(), respect_robots=False, timeout_ms=10, transport=transport
            ),
        )
    assert error.value.code == "FETCH_TIMEOUT"
    assert calls == 1


async def test_the_streamed_body_stops_at_the_byte_bound_without_partial_content() -> None:
    async def body() -> AsyncIterator[bytes]:
        yield b"a" * 10
        yield b"b" * 10

    async def transport(_request: SafeFetchRequest) -> SafeFetchResponse:
        return SafeFetchResponse(status=200, headers={}, body=body())

    with pytest.raises(AppError) as error:
        await safe_fetch(
            "https://example.test/big",
            SafeFetchOptions(lookup=public_lookup(), respect_robots=False, max_bytes=15, transport=transport),
        )
    assert error.value.code == "FETCH_TOO_LARGE"


async def test_a_redirect_without_location_is_a_readable_http_error() -> None:
    async def transport(_request: SafeFetchRequest) -> SafeFetchResponse:
        return response(301)

    with pytest.raises(AppError) as error:
        await safe_fetch(
            "https://example.test/a",
            SafeFetchOptions(lookup=public_lookup(), respect_robots=False, transport=transport),
        )
    assert error.value.code == "FETCH_HTTP_ERROR"
    assert error.value.status == 301


async def test_robots_txt_is_cached_per_origin() -> None:
    clear_robots_cache()
    paths: list[str] = []

    async def transport(request: SafeFetchRequest) -> SafeFetchResponse:
        paths.append(request.url.path)
        if request.url.path == "/robots.txt":
            return response(200, {}, "User-agent: *\nDisallow: /prive")
        return response(200, {}, "page")

    await safe_fetch("https://example.test/a", SafeFetchOptions(lookup=public_lookup(), transport=transport))
    await safe_fetch("https://example.test/b", SafeFetchOptions(lookup=public_lookup(), transport=transport))
    with pytest.raises(AppError):
        await safe_fetch(
            "https://example.test/prive", SafeFetchOptions(lookup=public_lookup(), transport=transport)
        )

    assert paths == ["/robots.txt", "/a", "/b"]


async def test_allowing_private_hosts_skips_the_resolution() -> None:
    resolution = await resolve_public_url("http://ia.local:11434/v1", allow_private=True)

    assert resolution.addresses == ()
    assert resolution.url.href == "http://ia.local:11434/v1"


async def test_a_host_without_address_is_refused() -> None:
    async def lookup(_hostname: str) -> Any:
        return ()

    with pytest.raises(AppError) as error:
        await resolve_public_url("https://example.test/", lookup=lookup)
    assert error.value.code == "URL_BLOCKED_HOST"


@pytest.mark.parametrize(
    ("address", "blocked"),
    [
        ("127.0.0.1", True),
        ("10.0.0.1", True),
        ("169.254.169.254", True),
        ("192.168.1.10", True),
        ("100.64.0.1", True),
        ("224.0.0.1", True),
        ("93.184.216.34", False),
        ("8.8.8.8", False),
    ],
)
def test_ipv4_classification(address: str, blocked: bool) -> None:
    assert is_blocked_ipv4(address) is blocked
    assert is_blocked_ip(address) is blocked


@pytest.mark.parametrize(
    ("address", "blocked"),
    [
        ("::", True),
        ("::1", True),
        ("fe80::1", True),
        ("fd00::1", True),
        ("ff02::1", True),
        ("2001:db8::1", True),
        ("::ffff:10.0.0.1", True),
        ("::ffff:93.184.216.34", False),
        ("2001:4860:4860::8888", False),
    ],
)
def test_ipv6_classification(address: str, blocked: bool) -> None:
    assert is_blocked_ipv6(address) is blocked


def test_the_ipv6_parser_expands_compression_and_embedded_ipv4() -> None:
    assert parse_ipv6("::1") == [0, 0, 0, 0, 0, 0, 0, 1]
    assert parse_ipv6("2001:db8::1") == [0x2001, 0xDB8, 0, 0, 0, 0, 0, 1]
    assert parse_ipv6("::ffff:192.168.1.10") == [0, 0, 0, 0, 0, 0xFFFF, 0xC0A8, 0x10A]
    assert parse_ipv6("not-an-ip") is None
