"""Public push endpoint of a browser subscription (SPEC-205 EF-1, CL-3, ET-3).

Port of `isPublicPushEndpoint` (`packages/contracts/src/push.ts`). The rule is a Zod refinement of
the contract, which the generated Pydantic model cannot express: OpenAPI keeps only the string
length, so the facade applies it after validation, like the other contract refinements. The check is
syntactic, without any DNS lookup: the live transport never follows a redirection and never contacts
a private address.
"""

import re
from urllib.parse import urlsplit

PUSH_ENDPOINT_MAX_LENGTH = 2048
"""Longest endpoint accepted, also the database bound of `push_subscriptions.endpoint`."""

MOCK_PUSH_HOST = "push.mock.learny.test"
"""Host of the deterministic mock push service (`PUSH_MODE=mock`, EF-6): never resolved."""

_IPV4 = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")
_LOCAL_SUFFIXES = (".localhost", ".local", ".internal", ".home.arpa")
_FORBIDDEN = re.compile(r"[\s\\]")


def is_public_push_endpoint(value: str) -> bool:
    """HTTPS only, no credentials, a public host name (no IP literal, no local-only name)."""
    if len(value) > PUSH_ENDPOINT_MAX_LENGTH or _FORBIDDEN.search(value) is not None:
        return False
    try:
        parsed = urlsplit(value)
        host = (parsed.hostname or "").lower()
        has_credentials = parsed.username is not None or parsed.password is not None
        port = parsed.port
    except ValueError:
        return False
    del port
    if parsed.scheme != "https" or has_credentials:
        return False
    if host == "" or host == "localhost" or host.startswith("[") or _IPV4.match(host):
        return False
    if "." not in host or host.endswith("."):
        return False
    return not any(host.endswith(suffix) for suffix in _LOCAL_SUFFIXES)


__all__ = [
    "MOCK_PUSH_HOST",
    "PUSH_ENDPOINT_MAX_LENGTH",
    "is_public_push_endpoint",
]
