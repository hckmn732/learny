"""Bounded, anti-SSRF retrieval of a user-supplied URL (SPEC-510 ET-1, EF-5; ADR-0159).

Port of `packages/core/src/net/{ip-ranges,assert-public-url,safe-fetch}.ts`. Every hop is validated
by `resolve_public_url`, the connection is pinned on the verified address (no second DNS resolution
can rebind it), redirects are followed manually and re-checked, the body is read in a stream with a
hard byte bound, the whole exchange has one total deadline and robots.txt is honoured for
`LearnyBot`. The default transport uses `httpx` with the verified address and an explicit SNI
hostname; tests inject a transport that never opens a socket.
"""

import asyncio
import re
import socket
import time
from collections.abc import AsyncIterable, AsyncIterator, Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx

from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts

MAX_URL_LENGTH = 2048
PUBLIC_PORTS = frozenset({"", "80", "443"})

SAFE_FETCH_TIMEOUT_MS = 15_000
SAFE_FETCH_MAX_BYTES = 5 * 1_048_576
SAFE_FETCH_MAX_REDIRECTS = 5
DEFAULT_ROBOTS_TIMEOUT_MS = 5_000
DEFAULT_ROBOTS_MAX_BYTES = 512 * 1_024
ROBOTS_CACHE_TTL_MS = 24 * 60 * 60 * 1_000
LEARNY_BOT_AGENT = "LearnyBot/1.0 (+https://learny.app/bot)"
DEFAULT_ACCEPT = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"

LOCAL_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa")

# --- address classification (ADR-0159 point 2) --------------------------------------------------

_IPV4_CIDRS: tuple[tuple[tuple[int, int, int, int], int], ...] = (
    ((0, 0, 0, 0), 8),
    ((10, 0, 0, 0), 8),
    ((100, 64, 0, 0), 10),
    ((127, 0, 0, 0), 8),
    ((169, 254, 0, 0), 16),
    ((172, 16, 0, 0), 12),
    ((192, 0, 0, 0), 24),
    ((192, 0, 2, 0), 24),
    ((192, 88, 99, 0), 24),
    ((192, 168, 0, 0), 16),
    ((198, 18, 0, 0), 15),
    ((198, 51, 100, 0), 24),
    ((203, 0, 113, 0), 24),
    ((224, 0, 0, 0), 4),
    ((240, 0, 0, 0), 4),
)

_IPV4_PART = re.compile(r"^\d{1,3}$")
_IPV6_GROUP = re.compile(r"^[0-9a-f]{1,4}$")


def parse_ipv4(address: str) -> tuple[int, int, int, int] | None:
    """Decimal dotted quad -> four octets, or `None`."""
    parts = address.split(".")
    if len(parts) != 4:
        return None
    values: list[int] = []
    for part in parts:
        if _IPV4_PART.match(part) is None:
            return None
        value = int(part)
        if value > 255:
            return None
        values.append(value)
    return (values[0], values[1], values[2], values[3])


def _in_cidr4(address: tuple[int, int, int, int], cidr: tuple[tuple[int, int, int, int], int]) -> bool:
    base, prefix = cidr
    remaining = prefix
    for index in range(4):
        bits = min(8, remaining)
        if bits == 0:
            return True
        mask = (0xFF << (8 - bits)) & 0xFF
        if (address[index] & mask) != (base[index] & mask):
            return False
        remaining -= bits
    return True


def is_blocked_ipv4(address: str | tuple[int, int, int, int]) -> bool:
    """True for every IPv4 address the server must never contact."""
    parsed = parse_ipv4(address) if isinstance(address, str) else address
    if parsed is None:
        return True
    return any(_in_cidr4(parsed, cidr) for cidr in _IPV4_CIDRS)


def _parse_groups(half: str) -> list[int] | None:
    if half == "":
        return []
    groups: list[int] = []
    for group in half.split(":"):
        if _IPV6_GROUP.match(group) is None:
            return None
        groups.append(int(group, 16))
    return groups


def parse_ipv6(address: str) -> list[int] | None:
    """Expands an IPv6 literal (without brackets) into its eight 16-bit groups."""
    text = address.lower()
    zone = text.find("%")
    if zone != -1:
        text = text[:zone]
    if text == "":
        return None

    tail_groups: list[int] = []
    if "." in text:
        last_colon = text.rfind(":")
        if last_colon == -1:
            return None
        ipv4 = parse_ipv4(text[last_colon + 1 :])
        if ipv4 is None:
            return None
        tail_groups = [(ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]]
        text = text[: last_colon + 1]
        if not text.endswith("::") and text.endswith(":"):
            text = text[:-1]

    halves = text.split("::")
    if len(halves) > 2:
        return None
    head = _parse_groups(halves[0])
    tail = _parse_groups(halves[1]) if len(halves) == 2 else []
    if head is None or tail is None:
        return None

    explicit = [*head, *tail, *tail_groups]
    zeros = 8 - len(explicit)
    if len(halves) == 1:
        return explicit if len(explicit) == 8 else None
    if zeros < 0:
        return None
    return [*head, *([0] * zeros), *tail, *tail_groups]


def _is_blocked_ipv6_groups(groups: Sequence[int]) -> bool:
    if len(groups) != 8:
        return True
    g0, g1, g2, g3, g4, g5, g6, g7 = groups
    if all(group == 0 for group in groups):
        return True
    if g0 == 0 and g1 == 0 and g2 == 0 and g3 == 0 and g4 == 0 and g5 == 0 and g6 == 0 and g7 == 1:
        return True
    if g0 == 0 and g1 == 0 and g2 == 0 and g3 == 0 and g4 == 0 and g5 in (0xFFFF, 0):
        embedded = (g6 >> 8, g6 & 0xFF, g7 >> 8, g7 & 0xFF)
        return is_blocked_ipv4(embedded)
    if g0 == 0x0064 and g1 == 0xFF9B and g2 == 0 and g3 == 0:
        if g4 == 0 and g5 == 0:
            embedded = (g6 >> 8, g6 & 0xFF, g7 >> 8, g7 & 0xFF)
            return is_blocked_ipv4(embedded)
        if g4 == 1:
            return True
    if g0 == 0x2002:
        embedded = (g1 >> 8, g1 & 0xFF, g2 >> 8, g2 & 0xFF)
        return is_blocked_ipv4(embedded)
    if g0 == 0x2001 and g1 == 0:
        server = (g2 >> 8, g2 & 0xFF, g3 >> 8, g3 & 0xFF)
        client = ((g6 ^ 0xFFFF) >> 8, (g6 ^ 0xFFFF) & 0xFF, (g7 ^ 0xFFFF) >> 8, (g7 ^ 0xFFFF) & 0xFF)
        return is_blocked_ipv4(server) or is_blocked_ipv4(client)
    if (g0 & 0xFE00) == 0xFC00:
        return True
    if (g0 & 0xFFC0) == 0xFE80:
        return True
    if (g0 & 0xFFC0) == 0xFEC0:
        return True
    if (g0 & 0xFF00) == 0xFF00:
        return True
    if g0 == 0x2001 and g1 == 0x0DB8:
        return True
    if g0 == 0x0100 and g1 == 0 and g2 == 0 and g3 == 0:
        return True
    if g0 == 0x2001 and (g1 & 0xFFF0) == 0x0010:
        return True
    return bool(g0 == 0x2001 and (g1 & 0xFFF0) == 0x0020)


def is_blocked_ipv6(address: str) -> bool:
    """True for every IPv6 address (and IPv4-mapped form) the server must never contact."""
    groups = parse_ipv6(address)
    if groups is None:
        return True
    return _is_blocked_ipv6_groups(groups)


def ip_family(address: str) -> int:
    """`4`, `6` or `0` for anything that is not an IP literal."""
    if parse_ipv4(address) is not None:
        return 4
    if ":" in address and parse_ipv6(address) is not None:
        return 6
    return 0


def is_blocked_ip(address: str) -> bool:
    """True when a literal IP (v4 or v6) is not publicly routable. Unknown input is blocked."""
    family = ip_family(address)
    if family == 4:
        return is_blocked_ipv4(address)
    if family == 6:
        return is_blocked_ipv6(address)
    return True


# --- public URL guard (ADR-0159 points 1, 2 and 7) -----------------------------------------------


@dataclass(frozen=True, slots=True)
class ResolvedAddress:
    address: str
    family: int


AddressLookup = Callable[[str], Awaitable[Sequence[ResolvedAddress]]]


@dataclass(frozen=True, slots=True)
class TargetUrl:
    """A parsed HTTP(S) URL, kept in the shape the transport and the guard need."""

    href: str
    scheme: str
    host: str
    port: int | None
    netloc: str
    path: str
    query: str
    origin: str

    @property
    def path_and_query(self) -> str:
        return f"{self.path}{f'?{self.query}' if self.query else ''}"

    @property
    def default_port(self) -> int:
        return 443 if self.scheme == "https" else 80


@dataclass(frozen=True, slots=True)
class PublicUrlResolution:
    url: TargetUrl
    addresses: tuple[ResolvedAddress, ...]


def _invalid(detail: str, *, status: int = 422) -> AppError:
    return AppError("URL_INVALID", detail, status=status)


def _blocked(detail: str) -> AppError:
    return AppError("URL_BLOCKED_HOST", detail, status=422)


def _is_local_hostname(hostname: str) -> bool:
    if hostname == "localhost" or hostname.endswith("."):
        return True
    if "." not in hostname:
        return True
    return any(hostname.endswith(suffix) for suffix in LOCAL_SUFFIXES)


def _target_of(parts: Any) -> TargetUrl:
    scheme = parts.scheme.lower()
    host = (parts.hostname or "").lower()
    try:
        port = parts.port
    except ValueError:
        port = None
    default_port = 443 if scheme == "https" else 80
    bracketed = f"[{host}]" if ":" in host else host
    if port is None or port == default_port:
        netloc = bracketed
        effective_port = default_port
    else:
        netloc = f"{bracketed}:{port}"
        effective_port = port
    path = parts.path or "/"
    query = parts.query
    fragment = f"#{parts.fragment}" if parts.fragment else ""
    href = f"{scheme}://{netloc}{path}{f'?{query}' if query else ''}{fragment}"
    origin = f"{scheme}://{netloc}"
    return TargetUrl(
        href=href,
        scheme=scheme,
        host=host,
        port=effective_port,
        netloc=netloc,
        path=path,
        query=query,
        origin=origin,
    )


async def _default_lookup(hostname: str) -> Sequence[ResolvedAddress]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    addresses: list[ResolvedAddress] = []
    for family, _type, _proto, _canonname, sockaddr in infos:
        address = str(sockaddr[0])
        addresses.append(ResolvedAddress(address=address, family=4 if family == socket.AF_INET else 6))
    return addresses


async def resolve_public_url(
    value: str,
    *,
    allow_private: bool = False,
    lookup: AddressLookup | None = None,
) -> PublicUrlResolution:
    """Parses and validates a user URL and returns the addresses that were checked.

    Without `allow_private`, the host name and every address it resolves to must be public; a DNS
    failure is refused rather than retried elsewhere.
    """
    raw = value.strip()
    if raw == "" or len(raw) > MAX_URL_LENGTH:
        raise _invalid(texts.FETCH_URL_EMPTY)
    try:
        parts = urlsplit(raw)
    except ValueError as error:
        raise _invalid(texts.FETCH_URL_INVALID) from error
    if parts.scheme not in ("https", "http"):
        raise _invalid(texts.FETCH_SCHEME_INVALID)
    if parts.username is not None or parts.password is not None:
        raise _invalid(texts.FETCH_CREDENTIALS_INVALID)
    url = _target_of(parts)
    if allow_private:
        return PublicUrlResolution(url=url, addresses=())

    if url.netloc == "" or parts.hostname is None:
        raise _invalid(texts.FETCH_HOST_MISSING)
    if _explicit_port(parts) not in PUBLIC_PORTS:
        raise _invalid(texts.FETCH_PORT_INVALID)

    hostname = url.host
    if ip_family(hostname) == 0 and _is_local_hostname(hostname):
        raise _blocked(texts.FETCH_LOCAL_HOST)
    family = ip_family(hostname)
    if family != 0:
        if is_blocked_ip(hostname):
            raise _blocked(texts.FETCH_ADDRESS_NOT_PUBLIC)
        return PublicUrlResolution(url=url, addresses=(ResolvedAddress(address=hostname, family=family),))

    resolver = lookup if lookup is not None else _default_lookup
    try:
        addresses = tuple(await resolver(hostname))
    except Exception as error:  # a DNS failure is refused, never retried elsewhere
        raise _blocked(texts.FETCH_HOST_UNRESOLVED) from error
    if not addresses:
        raise _blocked(texts.FETCH_HOST_NO_ADDRESS)
    if any(is_blocked_ip(entry.address) for entry in addresses):
        raise _blocked(texts.FETCH_HOST_PRIVATE)
    return PublicUrlResolution(url=url, addresses=addresses)


def _explicit_port(parts: Any) -> str:
    """The port written in the authority, or the empty string; malformed ports are refused."""
    netloc = parts.netloc
    if netloc.startswith("["):
        after = netloc.rsplit("]", 1)[-1]
        return after[1:] if after.startswith(":") else ""
    if ":" not in netloc:
        return ""
    value: str = netloc.rsplit(":", 1)[1]
    if value == "" or not value.isdigit():
        raise _invalid(texts.FETCH_PORT_INVALID)
    return value


# --- robots.txt (RFC 9309, same grammar as `safe-fetch.ts`) --------------------------------------


@dataclass(frozen=True, slots=True)
class _RobotsRule:
    allow: bool
    pattern: str


@dataclass(frozen=True, slots=True)
class _RobotsGroup:
    agents: tuple[str, ...]
    rules: tuple[_RobotsRule, ...]


@dataclass
class _RobotsEntry:
    text: str
    expires_at: float


_robots_cache: dict[str, _RobotsEntry] = {}


def clear_robots_cache() -> None:
    """Removes the process-wide robots cache; used by the deterministic tests."""
    _robots_cache.clear()


def _escape_regex(value: str) -> str:
    return re.escape(value)


def _rule_matches(pattern: str, path: str) -> bool:
    if pattern == "":
        return False
    anchored = pattern.endswith("$")
    source = pattern[:-1] if anchored else pattern
    expression = ".*".join(_escape_regex(part) for part in source.split("*"))
    return re.match(f"^{expression}{'$' if anchored else ''}", path) is not None


def _groups_of(text: str) -> list[_RobotsGroup]:
    groups: list[_RobotsGroup] = []
    agents: list[str] = []
    rules: list[_RobotsRule] = []
    in_rules = False

    def flush() -> None:
        nonlocal agents, rules, in_rules
        if agents:
            groups.append(_RobotsGroup(agents=tuple(agents), rules=tuple(rules)))
        agents = []
        rules = []
        in_rules = False

    for raw_line in re.split(r"\r?\n", text):
        line = raw_line.split("#")[0].strip()
        if line == "":
            continue
        separator = line.find(":")
        if separator == -1:
            continue
        key = line[:separator].strip().lower()
        value = line[separator + 1 :].strip()
        if key == "user-agent":
            if in_rules:
                flush()
            agents.append(value.lower())
            continue
        if key in ("allow", "disallow"):
            if not agents:
                continue
            in_rules = True
            rules.append(_RobotsRule(allow=key == "allow", pattern=value))
    flush()
    return groups


def is_allowed_by_robots(user_agent: str, path: str, text: str) -> bool:
    """True when the robots.txt of a site allows `user_agent` on `path` (longest rule wins)."""
    token = user_agent.split("/")[0].lower() or user_agent.lower()
    matching = [
        group for group in _groups_of(text) if any(agent == "*" or agent in token for agent in group.agents)
    ]
    if not matching:
        return True
    best: tuple[bool, int] | None = None
    for group in matching:
        for rule in group.rules:
            if not _rule_matches(rule.pattern, path):
                continue
            length = len(rule.pattern)
            if best is None or length > best[1] or (length == best[1] and rule.allow):
                best = (rule.allow, length)
    return best is None or best[0]


# --- transport and retrieval ---------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SafeFetchRequest:
    """One validated hop: the URL, the pinned address and the headers to send."""

    url: TargetUrl
    address: ResolvedAddress | None
    headers: Mapping[str, str]


@dataclass(frozen=True, slots=True)
class SafeFetchResponse:
    status: int
    headers: Mapping[str, str]
    body: AsyncIterable[bytes]


SafeFetchTransport = Callable[[SafeFetchRequest], Awaitable[SafeFetchResponse]]


@dataclass(frozen=True, slots=True)
class SafeFetchOptions:
    timeout_ms: int = SAFE_FETCH_TIMEOUT_MS
    max_bytes: int = SAFE_FETCH_MAX_BYTES
    max_redirects: int = SAFE_FETCH_MAX_REDIRECTS
    allow_private: bool = False
    lookup: AddressLookup | None = None
    respect_robots: bool = True
    robots_timeout_ms: int = DEFAULT_ROBOTS_TIMEOUT_MS
    robots_max_bytes: int = DEFAULT_ROBOTS_MAX_BYTES
    user_agent: str = LEARNY_BOT_AGENT
    accept: str = DEFAULT_ACCEPT
    transport: SafeFetchTransport | None = None


@dataclass(frozen=True, slots=True)
class SafeFetchResult:
    status: int
    url: str
    content_type: str | None
    body: bytes


def _timed_out(detail: str = texts.FETCH_TIMEOUT) -> AppError:
    return AppError("FETCH_TIMEOUT", detail, status=504)


def _too_large(max_bytes: int) -> AppError:
    return AppError(
        "FETCH_TOO_LARGE",
        texts.FETCH_BODY_TOO_LARGE.format(limit=max(1, max_bytes // 1_048_576)),
        status=422,
    )


def _failed(detail: str) -> AppError:
    return AppError("FETCH_FAILED", detail, status=503)


def _header(headers: Mapping[str, str], name: str) -> str | None:
    value = headers.get(name)
    if value is None:
        value = headers.get(name.lower())
    if value is None:
        value = headers.get(name.title())
    return value


def _request_headers(options: SafeFetchOptions, host: str, port: int) -> dict[str, str]:
    default_port = 443 if port == 443 else 80
    host_header = host if port == default_port else f"{host}:{port}"
    return {
        "Host": host_header,
        "user-agent": options.user_agent,
        "accept": options.accept,
        "accept-encoding": "identity",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.5",
    }


async def _httpx_transport(request: SafeFetchRequest) -> SafeFetchResponse:
    """Default transport: one request, no automatic redirect, pinned address and explicit SNI."""
    url = request.url
    address = request.address
    connect_host = url.host
    if address is not None:
        connect_host = f"[{address.address}]" if ":" in address.address else address.address
    target = f"{url.scheme}://{connect_host}:{url.port}{url.path_and_query}"
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(SAFE_FETCH_TIMEOUT_MS / 1000),
        follow_redirects=False,
        trust_env=False,
    )
    stream = client.stream(
        "GET",
        target,
        headers=dict(request.headers),
        extensions={"sni_hostname": url.host},
    )
    try:
        response = await stream.__aenter__()
    except BaseException:
        await client.aclose()
        raise

    async def iterate() -> AsyncIterator[bytes]:
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        finally:
            await stream.__aexit__(None, None, None)
            await client.aclose()

    return SafeFetchResponse(
        status=response.status_code,
        headers=dict(response.headers),
        body=iterate(),
    )


async def _read_body(body: AsyncIterable[bytes], max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    try:
        async for chunk in body:
            total += len(chunk)
            if total > max_bytes:
                raise _too_large(max_bytes)
            chunks.append(chunk)
    except AppError:
        raise
    except Exception as error:  # any interrupted stream is a readable failure
        raise _failed(texts.FETCH_BODY_READ_FAILED) from error
    return b"".join(chunks)


async def _discard(body: AsyncIterable[bytes]) -> None:
    """Closes an unread response stream (a redirect body is never copied)."""
    close = getattr(body, "aclose", None)
    if close is None:
        return
    try:
        await close()
    except Exception:  # closing a discarded body never changes the outcome
        return


async def _robots_allows(url: TargetUrl, options: SafeFetchOptions) -> bool:
    origin = url.origin
    now = time.monotonic()
    cached = _robots_cache.get(origin)
    if cached is not None and cached.expires_at > now:
        text = cached.text
    else:
        text = ""
        try:
            response = await safe_fetch(
                f"{origin}/robots.txt",
                replace(
                    options,
                    respect_robots=False,
                    timeout_ms=options.robots_timeout_ms,
                    max_bytes=options.robots_max_bytes,
                    max_redirects=2,
                ),
            )
            text = response.body.decode("utf-8", errors="replace")
        except AppError:
            # An absent or unreadable robots.txt does not forbid a public page (RFC 9309 2.3.1.4).
            text = ""
        _robots_cache[origin] = _RobotsEntry(
            text=text, expires_at=time.monotonic() + ROBOTS_CACHE_TTL_MS / 1000
        )
    return is_allowed_by_robots(options.user_agent, url.path_and_query, text)


async def _fetch_once(
    value: str, options: SafeFetchOptions, transport: SafeFetchTransport
) -> SafeFetchResult:
    resolution = await resolve_public_url(value, allow_private=options.allow_private, lookup=options.lookup)
    if options.respect_robots and not await _robots_allows(resolution.url, options):
        raise AppError(
            "WEB_ROBOTS_DISALLOWED",
            texts.FETCH_ROBOTS_DISALLOWED,
            status=422,
        )
    request = SafeFetchRequest(
        url=resolution.url,
        address=resolution.addresses[0] if resolution.addresses else None,
        headers=_request_headers(options, resolution.url.host, resolution.url.port or 443),
    )
    try:
        response = await transport(request)
    except AppError:
        raise
    except TimeoutError as error:
        raise _timed_out() from error
    except asyncio.CancelledError:
        raise _timed_out() from None
    except Exception as error:  # any connection failure is a readable failure
        raise _failed(texts.FETCH_CONTACT_FAILED) from error

    if 300 <= response.status < 400:
        location = _header(response.headers, "location")
        if location is None:
            raise AppError(
                "FETCH_HTTP_ERROR",
                texts.FETCH_REDIRECT_INCOMPLETE,
                status=response.status,
            )
        await _discard(response.body)
        return SafeFetchResult(
            status=response.status,
            url=urljoin(resolution.url.href, location),
            content_type=None,
            body=b"",
        )
    if response.status >= 400:
        raise AppError(
            "FETCH_HTTP_ERROR",
            texts.FETCH_HTTP_ERROR.format(status=response.status),
            status=response.status,
        )
    body = await _read_body(response.body, options.max_bytes)
    return SafeFetchResult(
        status=response.status,
        url=resolution.url.href,
        content_type=_header(response.headers, "content-type"),
        body=body,
    )


async def safe_fetch(value: str, options: SafeFetchOptions | None = None) -> SafeFetchResult:
    """ADR-0159: fetches a user URL with every guard enabled.

    Raises a typed `AppError` before any request for a forbidden address, and a bounded code for a
    timeout, an oversized body, a bad status or too many redirects. The returned body is complete
    and never partial.
    """
    chosen = options if options is not None else SafeFetchOptions()
    transport = chosen.transport if chosen.transport is not None else _httpx_transport
    try:
        async with asyncio.timeout(chosen.timeout_ms / 1000):
            target = value.strip()
            for hop in range(chosen.max_redirects + 1):
                result = await _fetch_once(target, chosen, transport)
                if not 300 <= result.status < 400:
                    return result
                if hop == chosen.max_redirects:
                    raise AppError(
                        "FETCH_TOO_MANY_REDIRECTS",
                        texts.FETCH_TOO_MANY_REDIRECTS,
                        status=422,
                    )
                target = result.url
    except TimeoutError as error:
        raise _timed_out() from error
    raise AppError(
        "FETCH_TOO_MANY_REDIRECTS",
        texts.FETCH_TOO_MANY_REDIRECTS,
        status=422,
    )


__all__ = [
    "DEFAULT_ACCEPT",
    "DEFAULT_ROBOTS_MAX_BYTES",
    "DEFAULT_ROBOTS_TIMEOUT_MS",
    "LEARNY_BOT_AGENT",
    "MAX_URL_LENGTH",
    "PUBLIC_PORTS",
    "ROBOTS_CACHE_TTL_MS",
    "SAFE_FETCH_MAX_BYTES",
    "SAFE_FETCH_MAX_REDIRECTS",
    "SAFE_FETCH_TIMEOUT_MS",
    "AddressLookup",
    "PublicUrlResolution",
    "ResolvedAddress",
    "SafeFetchOptions",
    "SafeFetchRequest",
    "SafeFetchResponse",
    "SafeFetchResult",
    "SafeFetchTransport",
    "TargetUrl",
    "clear_robots_cache",
    "ip_family",
    "is_allowed_by_robots",
    "is_blocked_ip",
    "is_blocked_ipv4",
    "is_blocked_ipv6",
    "parse_ipv4",
    "parse_ipv6",
    "resolve_public_url",
    "safe_fetch",
]
