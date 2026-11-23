"""Session cookies of `@supabase/ssr` (port of its storage adapter, SPEC-202 ET-3, ADR-0121).

The bytes matter: the browser replays these cookies to every context, and both runtimes must agree
on the name, the chunking and the attributes. This module reproduces `@supabase/ssr` 0.12.7 with the
`base64url` encoding it uses by default and the attribute order of `cookie` 1.1.1:

    sb-<ref>-auth-token[.n]=base64-<base64url(session JSON)>; Max-Age=34560000; Path=/; HttpOnly;
    SameSite=Lax[; Secure]

`<ref>` is the first label of the Supabase host, as `_getStorageKey` derives it. A value longer than
3180 characters is cut into `.<n>` chunks on its URI-encoded form; the session alphabet here is
`base64-` plus base64url, so the encoded form equals the raw form and the boundary guards of the
library (a cut escape sequence, a cut UTF-8 sequence) can never trigger.
"""

import base64
from collections.abc import Iterable, Mapping, Sequence
from typing import Any
from urllib.parse import quote, urlsplit

from learny.shared.jsonx import dumps

BASE64_PREFIX = "base64-"
MAX_CHUNK_SIZE = 3180
SESSION_MAX_AGE = 400 * 24 * 60 * 60
SAFE_CHARACTERS = "-_.!~*'()"
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "[::1]"})


def storage_key(supabase_url: str) -> str:
    """`sb-<first label of the host>-auth-token`, exactly like supabase-js derives it."""
    host = urlsplit(supabase_url).hostname or ""
    return f"sb-{host.split('.')[0]}-auth-token"


def is_local_host(hostname: str) -> bool:
    """`isLocalHost`: the only hosts where the `Secure` attribute is left out."""
    return hostname in LOCAL_HOSTS


def encode_base64url(payload: bytes) -> str:
    """`stringToBase64URL`: the url-safe alphabet, no padding."""
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def encode_session(document: Mapping[str, Any]) -> str:
    """The cookie value of one session: `base64-` and the compact JSON document."""
    return f"{BASE64_PREFIX}{encode_base64url(dumps(document))}"


def chunks(name: str, value: str, size: int = MAX_CHUNK_SIZE) -> list[tuple[str, str]]:
    """`createChunks`: one cookie while the encoded value fits, `.0`, `.1`... otherwise."""
    encoded = quote(value, safe=SAFE_CHARACTERS)
    if len(encoded) <= size:
        return [(name, value)]
    parts: list[str] = []
    while encoded:
        head = encoded[:size]
        last_escape = head.rfind("%")
        if last_escape > size - 3:
            head = head[:last_escape]
        parts.append(head)
        encoded = encoded[len(head) :]
    return [(f"{name}.{index}", part) for index, part in enumerate(parts)]


def is_chunk_like(cookie_name: str, key: str) -> bool:
    """`isChunkLike`: the base name, or `<base>.<n>` with `n` a canonical non-negative integer."""
    if cookie_name == key:
        return True
    prefix = f"{key}."
    if not cookie_name.startswith(prefix):
        return False
    suffix = cookie_name[len(prefix) :]
    if not suffix.isascii() or not suffix.isdigit():
        return False
    return suffix == "0" or not suffix.startswith("0")


def serialize(name: str, value: str, *, max_age: int, secure: bool) -> str:
    """`serializeCookieHeader` under `sessionCookieOptions`: the attribute order of `cookie`."""
    encoded = quote(value, safe=SAFE_CHARACTERS) if value else ""
    header = f"{name}={encoded}; Max-Age={max_age}; Path=/; HttpOnly"
    if secure:
        header += "; Secure"
    return f"{header}; SameSite=Lax"


def session_cookies(
    key: str,
    document: Mapping[str, Any],
    *,
    existing: Iterable[str],
    secure: bool,
) -> list[str]:
    """`setItem`: the stale chunks of a previous write are emptied, then the session is written."""
    written = chunks(key, encode_session(document))
    fresh = {name for name, _value in written}
    stale = [name for name in existing if is_chunk_like(name, key) and name not in fresh]
    headers = [serialize(name, "", max_age=0, secure=secure) for name in stale]
    headers.extend(serialize(name, value, max_age=SESSION_MAX_AGE, secure=secure) for name, value in written)
    return headers


def removed_session_cookies(key: str, existing: Iterable[str], *, secure: bool) -> list[str]:
    """`removeItem`: every chunk-like cookie of the key is emptied, in the order it was presented."""
    return [serialize(name, "", max_age=0, secure=secure) for name in existing if is_chunk_like(name, key)]


def session_names(key: str, existing: Sequence[str]) -> list[str]:
    """The presented cookie names that belong to the session key (chunks included)."""
    return [name for name in existing if is_chunk_like(name, key)]
