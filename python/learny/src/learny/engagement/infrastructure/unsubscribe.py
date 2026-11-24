"""One-click unsubscribe token (SPEC-2205).

`base64url(userId) + '.' + base64url(HMAC-SHA256(EMAIL_LINK_SECRET, 'unsubscribe:v1:' + userId))`,
without expiry, verified in constant time (SPEC-204 ET-4, ADR-0124).
"""

import base64
import binascii
import hmac
import re
import uuid
from hashlib import sha256

from learny.shared.locale_fr import engagement_email as fr

PREFIX = "unsubscribe:v1:"
MAX_TOKEN_LENGTH = 256

_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _signature(secret: str, user_id: str) -> bytes:
    return hmac.new(secret.encode("utf-8"), f"{PREFIX}{user_id}".encode(), sha256).digest()


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes | None:
    """`Buffer.from(value, 'base64url')`: padding is optional, anything undecodable is refused."""
    if re.search(r"[^A-Za-z0-9_\-=]", value) is not None:
        return None
    padding = "=" * (-len(value) % 4)
    try:
        return base64.urlsafe_b64decode(value + padding)
    except (binascii.Error, ValueError):
        return None


def is_user_id(value: object) -> bool:
    """The identifier shape the token accepts, independent of any database lookup."""
    return isinstance(value, str) and _UUID.match(value) is not None


def create_unsubscribe_token(secret: str, user_id: str) -> str:
    """The signed link payload of a learner; a malformed identifier is a programming error."""
    if not is_user_id(user_id):
        raise ValueError(fr.TOKEN_INVALID_USER)
    uuid.UUID(user_id)
    return f"{_b64url_encode(user_id.encode('utf-8'))}.{_b64url_encode(_signature(secret, user_id))}"


def verify_unsubscribe_token(secret: str, token: object) -> str | None:
    """The user identifier carried by a valid token, `None` otherwise (never raises)."""
    if not isinstance(token, str) or len(token) > MAX_TOKEN_LENGTH:
        return None
    dot = token.find(".")
    if dot <= 0 or dot == len(token) - 1:
        return None
    user_id = _b64url_decode(token[:dot])
    if user_id is None:
        return None
    try:
        decoded = user_id.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if not is_user_id(decoded):
        return None
    expected = _signature(secret, decoded)
    given = _b64url_decode(token[dot + 1 :])
    # A wrong length is compared against a same-size buffer so the time does not reveal it.
    if given is None or len(given) != len(expected):
        given = bytes(len(expected))
    return decoded if hmac.compare_digest(given, expected) else None


__all__ = [
    "MAX_TOKEN_LENGTH",
    "PREFIX",
    "create_unsubscribe_token",
    "is_user_id",
    "verify_unsubscribe_token",
]
