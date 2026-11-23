"""Identifiers (00-conventions section 7): UUIDv4 strings, like `crypto.randomUUID` in TypeScript."""

import re
import uuid

UUID_PATTERN = (
    r"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
    r"|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
)
"""The contract `uuid` format: RFC 4122 versions 1 to 8, the variant nibble, plus the two sentinels."""

_UUID = re.compile(UUID_PATTERN)


def new_id() -> str:
    """A fresh UUIDv4 rendered as a lowercase string."""
    return str(uuid.uuid4())


def is_uuid(value: object) -> bool:
    """`z.uuid()`: an identifier of the contract format, the nil and max UUIDs included."""
    return isinstance(value, str) and _UUID.match(value) is not None


__all__ = ["UUID_PATTERN", "is_uuid", "new_id"]
