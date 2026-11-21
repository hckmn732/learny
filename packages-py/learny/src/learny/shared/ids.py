"""Identifiers (00-conventions section 7): UUIDv4 strings, like `crypto.randomUUID` in TypeScript."""

import uuid


def new_id() -> str:
    """A fresh UUIDv4 rendered as a lowercase string."""
    return str(uuid.uuid4())
