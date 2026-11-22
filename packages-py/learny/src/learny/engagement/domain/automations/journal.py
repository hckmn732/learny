"""Selection and pagination of the automation journal (SPEC-2205, ET-5 of SPEC-711).

Ported from `listMyAutomationActions` and `parametres-automatismes.ts` (BR-AUT-12): the journal is
never in a random order — newest first, with the action identifier as an explicit ascending
tie-break — and the « N actions cette semaine » counter is exactly the prefix of that list. The
cursor is the opaque `base64url(JSON {k, id})` of `packages/contracts/src/cursor.ts`.
"""

import base64
import binascii
import json
from dataclasses import dataclass
from typing import Any, Final

CURSOR_PATTERN: Final = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
CURSOR_MAX_LENGTH: Final = 300


@dataclass(frozen=True, slots=True)
class JournalEntry:
    """The two fields the stable order reads; the rest of the row stays in the use case."""

    id: str
    automation: str
    created_at: str


def sort_actions(entries: list[JournalEntry]) -> list[JournalEntry]:
    """BR-AUT-12 - newest first, identifier ascending on a tie (never a random order)."""
    ordered = sorted(entries, key=lambda entry: entry.id)
    ordered.sort(key=lambda entry: entry.created_at, reverse=True)
    return ordered


def week_journal(entries: list[JournalEntry], week_count: int) -> list[JournalEntry]:
    """The visible journal of the week: the first `weekCount` rows of the stable list."""
    return sort_actions(entries)[: max(0, week_count)]


def _to_base64url(text: str) -> str:
    encoded = base64.urlsafe_b64encode(text.encode("utf-8")).decode("ascii")
    return encoded.rstrip("=")


def _from_base64url(value: str) -> str | None:
    if value == "" or any(character not in CURSOR_PATTERN for character in value):
        return None
    padded = value + "=" * ((4 - len(value) % 4) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode("ascii"))
        return raw.decode("utf-8", errors="strict")
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None


def encode_cursor(key: str | int, identifier: str) -> str:
    """`encodeCursor` - `{k, id}` compact JSON, base64url without padding."""
    return _to_base64url(json.dumps({"k": key, "id": identifier}, separators=(",", ":")))


def decode_cursor(cursor: str) -> tuple[str | int, str] | None:
    """`decodeCursor` - `None` for any unreadable or forged cursor, never an exception."""
    if not isinstance(cursor, str) or len(cursor) > CURSOR_MAX_LENGTH:
        return None
    text = _from_base64url(cursor)
    if text is None:
        return None
    try:
        parsed: Any = json.loads(text)
    except ValueError:
        return None
    if not isinstance(parsed, dict):
        return None
    key = parsed.get("k")
    identifier = parsed.get("id")
    if isinstance(key, bool) or not isinstance(key, (str, int, float)):
        return None
    if not isinstance(identifier, str) or identifier == "":
        return None
    return (key if isinstance(key, str) else int(key), identifier)
