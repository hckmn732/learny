"""Header identity resolution into an Actor (SPEC-2101 step 2, ADR-2010).

A Bearer token has precedence over the session cookie, and an invalid Bearer is an error: it never
falls back to the cookie, which would silently accept a stale browser session.
"""

from collections.abc import Mapping

from learny.identity.domain.actor import Actor
from learny.identity.infrastructure.jwt import JwtVerifier
from learny.identity.infrastructure.supabase_cookies import access_token_from_cookies


def parse_cookie_header(header: str | None) -> dict[str, str]:
    """`a=1; b=2` -> `{"a": "1", "b": "2"}`; malformed pairs are ignored."""
    cookies: dict[str, str] = {}
    if not header:
        return cookies
    for part in header.split(";"):
        name, separator, value = part.strip().partition("=")
        if separator and name:
            cookies[name] = value
    return cookies


def bearer_token(header: str | None) -> str | None:
    """The token of an `Authorization: Bearer <token>` header, or None."""
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    stripped = token.strip()
    return stripped or None


def authenticate(verifier: JwtVerifier, headers: Mapping[str, str]) -> Actor | None:
    """Resolves the caller; raises `UNAUTHENTICATED` for an invalid Bearer token."""
    token = bearer_token(headers.get("authorization"))
    if token is not None:
        return verifier.verify(token, "bearer")
    cookie_token = access_token_from_cookies(parse_cookie_header(headers.get("cookie")))
    if cookie_token is not None:
        return verifier.verify(cookie_token, "cookie")
    return None
