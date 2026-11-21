"""JSON rendering identical to the TypeScript backend (00-conventions section 7).

`dumps` mirrors `JSON.stringify` (no spaces, no ASCII escaping, insertion order) and `canonical`
mirrors `canonicalJson` from `packages/db` (keys sorted by UTF-16 code units, `None` members
omitted). Both are used for API bodies, event ids and idempotency request hashes, so they must be
byte-identical across runtimes.
"""

import json
from typing import Any

from learny.shared.jsmath import js_number

JsonValue = Any


def _encode_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def _encode(value: JsonValue) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return _encode_string(value)
    if isinstance(value, (int, float)):
        return js_number(value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_encode(item) for item in value) + "]"
    if isinstance(value, dict):
        members = (f"{_encode_string(str(key))}:{_encode(item)}" for key, item in value.items())
        return "{" + ",".join(members) + "}"
    raise TypeError(f"{type(value).__name__} is not JSON serialisable")


def dumps(value: JsonValue) -> bytes:
    """`JSON.stringify(value)` as UTF-8 bytes."""
    return _encode(value).encode("utf-8")


def _utf16_key(key: str) -> bytes:
    """JavaScript sorts object keys by UTF-16 code units, not by code points."""
    return key.encode("utf-16-be")


def _canonical(value: JsonValue) -> str:
    if isinstance(value, dict):
        members = []
        for key in sorted(value, key=_utf16_key):
            item = value[key]
            if item is None:
                continue
            members.append(f"{_encode_string(str(key))}:{_canonical(item)}")
        return "{" + ",".join(members) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_canonical(item) for item in value) + "]"
    return _encode(value)


def canonical(value: JsonValue) -> bytes:
    """Canonical JSON used for event ids and idempotency hashes."""
    return _canonical(value).encode("utf-8")
