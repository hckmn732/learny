"""Device tokens of the native push channels (SPEC-3501, ADR-3007).

A token identifies one installation and authenticates the delivery: it is a credential. This module
owns its two properties, both of them pure - the shape a token must have to be stored (EF-3, EF-4)
and the mask under which it may appear in a journal line (ET-4). Nothing here talks to a provider:
only APNs and FCM know whether a well-formed token is still live.
"""

import re
from typing import Final

PUSH_KINDS: Final = ("webpush", "apns", "fcm")
NATIVE_KINDS: Final = ("apns", "fcm")
SUBSCRIPTION_PLATFORMS: Final = ("ios", "android")
TOKEN_MIN_LENGTH: Final = 16
TOKEN_MAX_LENGTH: Final = 512
# APNs tokens are hexadecimal today, FCM tokens carry `:` and `-`; the intersection is kept wide
# enough not to refuse a provider revision, narrow enough to keep the column and the logs clean.
_TOKEN_SHAPE = re.compile(r"^[A-Za-z0-9_.:-]+$")
_MASK_KEPT = 4


def is_native_kind(kind: object) -> bool:
    """True for `apns` and `fcm`, the two channels that carry a device token."""
    return isinstance(kind, str) and kind in NATIVE_KINDS


def is_push_kind(kind: object) -> bool:
    """True for the three channels of the contract (`webpush`, `apns`, `fcm`)."""
    return isinstance(kind, str) and kind in PUSH_KINDS


def is_valid_token(token: object) -> bool:
    """ET-1 - the shape of a device token: bounded length, no whitespace, no separator."""
    if not isinstance(token, str):
        return False
    if len(token) < TOKEN_MIN_LENGTH or len(token) > TOKEN_MAX_LENGTH:
        return False
    return _TOKEN_SHAPE.match(token) is not None


def platform_of(kind: str, platform: object = None) -> str | None:
    """The platform a channel implies; an explicit value wins when it is one of the two allowed."""
    if isinstance(platform, str) and platform in SUBSCRIPTION_PLATFORMS:
        return platform
    if kind == "apns":
        return "ios"
    if kind == "fcm":
        return "android"
    return None


def mask_token(token: object) -> str:
    """ET-4 - the only form of a token a journal line may carry: its last four characters."""
    if not isinstance(token, str) or token == "":
        return "..."
    kept = token[-_MASK_KEPT:] if len(token) > _MASK_KEPT else ""
    return f"...{kept}"


def mask_endpoint(endpoint: object) -> str:
    """ET-4 - a Web Push endpoint names its client in the path: only the host is journalled."""
    if not isinstance(endpoint, str) or endpoint == "":
        return "..."
    host = endpoint.split("://", 1)[-1].split("/", 1)[0]
    return host or "..."


__all__ = [
    "NATIVE_KINDS",
    "PUSH_KINDS",
    "SUBSCRIPTION_PLATFORMS",
    "TOKEN_MAX_LENGTH",
    "TOKEN_MIN_LENGTH",
    "is_native_kind",
    "is_push_kind",
    "is_valid_token",
    "mask_endpoint",
    "mask_token",
    "platform_of",
]
