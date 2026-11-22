"""Origin check of the mutations of /api/v1 (SPEC-2101 step 3, ADR-0213).

Port of `packages/services/src/security/origin-guard.ts` and of the trusted-proxy helpers of
`packages/http/src/security.ts`. A mutation must come from the application or from an origin listed
in `ALLOWED_ORIGINS`; origins are compared exactly, after normalisation, with no wildcard and no
suffix match. Forwarded headers are trusted only through the relay secret, verified in constant time.
"""

import hashlib
import hmac
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlsplit

from learny.shared.errors import AppError
from learny.shared.locale_fr.details import ORIGIN_REJECTED

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
PROXY_SECRET_HEADER = "x-learny-proxy-secret"  # noqa: S105 - a header name, not a secret
BEARER_WITHOUT_ORIGIN = re.compile(r"^Bearer[ \t]+\S+$", re.IGNORECASE)


class HttpRequest(Protocol):
    """The part of a Starlette request this module reads (kept structural for the tests)."""

    @property
    def method(self) -> str: ...

    @property
    def headers(self) -> Mapping[str, str]: ...

    @property
    def scope(self) -> Mapping[str, Any]: ...


@dataclass(frozen=True, slots=True)
class OriginRequest:
    """What the guard needs to decide; `request_origin` is the origin the call was received on."""

    method: str
    pathname: str
    origin: str | None
    sec_fetch_site: str | None
    request_origin: str


def normalize(value: str) -> str | None:
    """`URL.origin`: lower-case scheme and host, no default port, no path. None when unparsable."""
    try:
        parsed = urlsplit(value.strip())
    except ValueError:
        return None
    scheme = parsed.scheme.lower()
    host = parsed.hostname
    if scheme == "" or scheme == "null" or host is None:
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    if (scheme == "https" and port == 443) or (scheme == "http" and port == 80):
        port = None
    if ":" in host:
        host = f"[{host}]"
    return f"{scheme}://{host}" if port is None else f"{scheme}://{host}:{port}"


def is_origin_exempt(method: str, pathname: str) -> bool:
    """Paths that carry their own proof of origin (signature, token) and are exempt."""
    if pathname.startswith("/api/v1/webhooks/"):
        return True
    if pathname == "/api/inngest" or pathname.startswith("/api/inngest/"):
        return True
    return method.upper() == "POST" and pathname == "/api/v1/email/unsubscribe"


def parse_allowed_origins(value: str | None) -> list[str]:
    """`ALLOWED_ORIGINS` is a comma-separated list; an invalid entry fails the startup."""
    if value is None or value.strip() == "":
        return []
    origins: list[str] = []
    for entry in value.split(","):
        origin = normalize(entry)
        if origin is None:
            raise ValueError(f"invalid ALLOWED_ORIGINS entry: {entry.strip()!r}")
        origins.append(origin)
    return origins


@dataclass(frozen=True, slots=True)
class OriginGuard:
    """The configured check; `check` raises `ORIGIN_REJECTED` for a foreign mutation."""

    app_url: str | None
    allowed_origins: list[str]

    def check(self, request: OriginRequest) -> None:
        method = request.method.upper()
        if method in SAFE_METHODS or is_origin_exempt(method, request.pathname):
            return
        configured = normalize(self.app_url) if self.app_url is not None else None
        fallback = configured if configured is not None else normalize(request.request_origin)
        accepted = {origin for origin in (fallback, *self.allowed_origins) if origin is not None}
        if request.origin is None:
            accepted_request = request.sec_fetch_site == "same-origin"
        else:
            origin = normalize(request.origin)
            accepted_request = origin is not None and origin in accepted
        if not accepted_request:
            raise AppError("ORIGIN_REJECTED", ORIGIN_REJECTED)


def create_origin_guard(app_url: str | None = None, allowed_origins: str | None = None) -> OriginGuard:
    """Builds the guard from `NEXT_PUBLIC_APP_URL` and `ALLOWED_ORIGINS`."""
    return OriginGuard(app_url=app_url, allowed_origins=parse_allowed_origins(allowed_origins))


def first_forwarded(value: str | None) -> str | None:
    """The first entry of a comma-separated forwarded header, trimmed; None when empty."""
    if value is None:
        return None
    first = value.split(",")[0].strip()
    return first or None


def same_secret(expected: str, received: str) -> bool:
    """Constant-time comparison of two secrets through their SHA-256 digest."""
    expected_digest = hashlib.sha256(expected.encode("utf-8")).digest()
    received_digest = hashlib.sha256(received.encode("utf-8")).digest()
    return hmac.compare_digest(expected_digest, received_digest)


def _proxy_secrets(env: Mapping[str, str | None]) -> list[str]:
    return [
        secret
        for secret in (env.get("API_PROXY_SECRET"), env.get("API_PROXY_SECRET_PREVIOUS"))
        if secret is not None and secret != ""
    ]


def _proxy_configured(env: Mapping[str, str | None]) -> bool:
    """`API_PROXY_SECRET` or its previous value is *defined* (an empty value still counts)."""
    return env.get("API_PROXY_SECRET") is not None or env.get("API_PROXY_SECRET_PREVIOUS") is not None


def is_trusted_proxy(headers: Mapping[str, str], env: Mapping[str, str | None]) -> bool:
    """True when the call carries the current or the previous relay secret."""
    expected = _proxy_secrets(env)
    if not expected:
        return False
    received = headers.get(PROXY_SECRET_HEADER)
    if received is None:
        return False
    return any(same_secret(secret, received) for secret in expected)


def _accepts_forwarded(headers: Mapping[str, str], env: Mapping[str, str | None]) -> bool:
    """The relay secret wins; the legacy `TRUST_PROXY` mode only applies without any secret."""
    if is_trusted_proxy(headers, env):
        return True
    return not _proxy_configured(env) and env.get("TRUST_PROXY") == "true"


def _received_url(request: HttpRequest) -> tuple[str, str]:
    """`(scheme, host)` as the server received them, before any forwarded rewrite."""
    scheme = str(request.scope.get("scheme", "http"))
    host = request.headers.get("host")
    if not host:
        server = request.scope.get("server") or ("localhost", 80)
        host = f"{server[0]}:{server[1]}"
    return scheme, host


def request_origin(request: HttpRequest, env: Mapping[str, str | None]) -> str:
    """Rebuilds the browser-facing origin, only through a cryptographically trusted relay."""
    scheme, host = _received_url(request)
    trusted = is_trusted_proxy(request.headers, env)
    if trusted:
        host = first_forwarded(request.headers.get("x-forwarded-host")) or host
    forwarded_proto = (
        first_forwarded(request.headers.get("x-forwarded-proto"))
        if _accepts_forwarded(request.headers, env)
        else None
    )
    protocol = forwarded_proto if forwarded_proto in ("https", "http") else scheme
    return f"{protocol}://{host}"


def client_address(request: HttpRequest, env: Mapping[str, str | None]) -> str | None:
    """First `X-Forwarded-For` address, only from a trusted relay; None otherwise."""
    if not _accepts_forwarded(request.headers, env):
        return None
    return first_forwarded(request.headers.get("x-forwarded-for"))


def bearer_without_origin(headers: Mapping[str, str]) -> bool:
    """A Bearer mutation without `Origin` is exempt: a token cannot be sent by a browser form."""
    if headers.get("origin") is not None:
        return False
    return BEARER_WITHOUT_ORIGIN.match(headers.get("authorization") or "") is not None


@dataclass(frozen=True, slots=True)
class RequestOriginGuard:
    """The guard used by the pipeline: it reads the request itself."""

    env: Mapping[str, str | None]

    def check(self, request: HttpRequest) -> None:
        if bearer_without_origin(request.headers):
            return
        create_origin_guard(
            app_url=self.env.get("NEXT_PUBLIC_APP_URL"),
            allowed_origins=self.env.get("ALLOWED_ORIGINS"),
        ).check(
            OriginRequest(
                method=request.method,
                pathname=str(urlsplit(str(request.scope.get("path", "/"))).path),
                origin=request.headers.get("origin"),
                sec_fetch_site=request.headers.get("sec-fetch-site"),
                request_origin=request_origin(request, self.env),
            )
        )


def create_request_origin_guard(env: Mapping[str, str | None]) -> RequestOriginGuard:
    """Builds the pipeline guard; an invalid `ALLOWED_ORIGINS` fails here, at startup."""
    parse_allowed_origins(env.get("ALLOWED_ORIGINS"))
    return RequestOriginGuard(env=env)


def settings_env(settings: Any) -> dict[str, str | None]:
    """The environment mapping the ported helpers expect, read from `Settings`."""
    return {
        "APP_ENV": settings.app_env,
        "ENABLE_SDD_PAGES": settings.enable_sdd_pages,
        "NEXT_PUBLIC_APP_URL": settings.next_public_app_url,
        "ALLOWED_ORIGINS": settings.allowed_origins,
        "API_PROXY_SECRET": settings.api_proxy_secret,
        "API_PROXY_SECRET_PREVIOUS": settings.api_proxy_secret_previous,
        "TRUST_PROXY": "true" if settings.trust_proxy else "false",
    }
