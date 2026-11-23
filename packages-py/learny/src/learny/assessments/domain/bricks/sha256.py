"""SHA-256 of a UTF-8 string (FIPS 180-4), the hash of every brick fingerprint (ADR-0289).

The TypeScript package ships its own implementation to stay isomorphic; the Python backend uses
the standard library, which computes the same digest. `_utf8` mirrors the `TextEncoder` behaviour
on a lone surrogate (replaced by U+FFFD) so both sides agree on every input.
"""

import hashlib


def _utf8(value: str) -> bytes:
    cleaned = "".join("\ufffd" if 0xD800 <= ord(character) <= 0xDFFF else character for character in value)
    return cleaned.encode("utf-8")


def sha256_hex(value: str) -> str:
    """Lower-case hexadecimal SHA-256 of the UTF-8 encoding of `value`."""
    return hashlib.sha256(_utf8(value)).hexdigest()


__all__ = ["sha256_hex"]
