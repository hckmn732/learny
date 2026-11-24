"""Session cookies written by `@supabase/ssr` (SPEC-2101 step 2).

The browser stores the Supabase session in a cookie named `sb-<ref>-auth-token`. A long session is
split into chunks `sb-<ref>-auth-token.0`, `.1`, ... and each value may carry a `base64-` prefix
before the URL-safe base64 of the JSON session. This module reassembles and decodes it without any
network call; the access token it returns is then verified like a Bearer token.
"""

import base64
import binascii
import json
from collections.abc import Mapping
from typing import Any

COOKIE_PREFIX = "sb-"
COOKIE_SUFFIX = "-auth-token"
BASE64_PREFIX = "base64-"


def session_cookie_base(cookies: Mapping[str, str]) -> str | None:
    """The base name of the session cookie (`sb-<ref>-auth-token`), or None."""
    for name in cookies:
        if not name.startswith(COOKIE_PREFIX):
            continue
        if name.endswith(COOKIE_SUFFIX):
            return name
        if f"{COOKIE_SUFFIX}." in name:
            return name.split(f"{COOKIE_SUFFIX}.")[0] + COOKIE_SUFFIX
    return None


def reassemble(cookies: Mapping[str, str], base: str) -> str:
    """Joins the chunked values of a session cookie in numeric order."""
    chunks = {name: value for name, value in cookies.items() if name == base or name.startswith(f"{base}.")}
    if base in chunks:
        return chunks[base]

    def index_of(name: str) -> int:
        suffix = name[len(base) + 1 :]
        return int(suffix) if suffix.isdigit() else 0

    return "".join(chunks[name] for name in sorted(chunks, key=index_of))


def decode_session(value: str) -> dict[str, Any] | None:
    """Decodes a cookie value: `base64-<b64url>` or plain JSON."""
    text = value
    if text.startswith(BASE64_PREFIX):
        encoded = text[len(BASE64_PREFIX) :]
        padding = "=" * (-len(encoded) % 4)
        try:
            text = base64.urlsafe_b64decode(f"{encoded}{padding}").decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            return None
    try:
        decoded = json.loads(text)
    except json.JSONDecodeError:
        return None
    return decoded if isinstance(decoded, dict) else None


def access_token_from_cookies(cookies: Mapping[str, str]) -> str | None:
    """The access token carried by the session cookie, or None when absent or unreadable."""
    base = session_cookie_base(cookies)
    if base is None:
        return None
    session = decode_session(reassemble(cookies, base))
    if session is None:
        return None
    token = session.get("access_token")
    return token if isinstance(token, str) and token != "" else None
