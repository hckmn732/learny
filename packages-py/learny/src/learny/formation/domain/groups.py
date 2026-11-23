"""Invitation codes of the shared formations (SPEC-724 ET-2, EF-1, CL-2, CL-3).

The code is `LRN-` followed by four characters drawn from `A-Z2-9` (34 symbols, no `0`, no `1`),
with rejection sampling so every symbol is equally likely; the code is never derived from a
sequential identifier. The random source is injectable, which keeps the tests deterministic.
"""

import secrets
from collections.abc import Callable
from typing import Final

from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    GROUP_MEMBERSHIP_AFTER_CREATE,
    INVALID_SUGGESTION,
    LRN_FORMAT,
    MISSING_SUGGESTION_CHAR,
    RANDOM_BOUND,
)

INVITE_CODE_ALPHABET: Final = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789"
GROUP_MAX_MEMBERS: Final = 10
INVITE_CODE_LENGTH: Final = 4
MAX_CODE_ATTEMPTS: Final = 8

RandomIndexSource = Callable[[int], int]


def crypto_random_index(max_exclusive: int) -> int:
    """ET-2 - cryptographic, unbiased source (`randomBytes` with rejection sampling)."""
    if not 1 <= max_exclusive <= 256:
        raise AppError("VALIDATION_FAILED", RANDOM_BOUND)
    return secrets.randbelow(max_exclusive)


def generate_invite_code(random_index: RandomIndexSource = crypto_random_index) -> str:
    """ET-2 - draws four symbols from `INVITE_CODE_ALPHABET`; the prefix is fixed."""
    suffix = ""
    for _ in range(INVITE_CODE_LENGTH):
        position = random_index(len(INVITE_CODE_ALPHABET))
        if not isinstance(position, int) or not 0 <= position < len(INVITE_CODE_ALPHABET):
            raise AppError("VALIDATION_FAILED", INVALID_SUGGESTION.format(position=position))
        character = INVITE_CODE_ALPHABET[position]
        if character == "":
            raise AppError("VALIDATION_FAILED", MISSING_SUGGESTION_CHAR)
        suffix += character
    return f"LRN-{suffix}"


def is_invite_code(value: object) -> bool:
    """EF-1 - a syntactically valid invitation code."""
    if not isinstance(value, str) or len(value) != 8 or not value.startswith("LRN-"):
        return False
    return all(character in INVITE_CODE_ALPHABET for character in value[4:])


def parse_invite_code(value: object) -> str:
    """EF-1, CL-3 - normalises user input (trim + upper case) before validating it."""
    normalised = value.strip().upper() if isinstance(value, str) else ""
    if not is_invite_code(normalised):
        raise AppError(
            "VALIDATION_FAILED",
            LRN_FORMAT,
            errors=[{"path": "inviteCode", "message": LRN_FORMAT}],
        )
    return normalised


def member_sort_key(first_name: str | None, role: str, user_id: str) -> str:
    """`memberSortKey`: the owner first, then by folded first name, then by identifier."""
    name = (first_name or "").lower()
    return f"{'0' if role == 'owner' else '1'}:{name}:{user_id}"


def member_status_of(value: str | None) -> str:
    """ET-5 - the membership row reuses `formation_status`; three member states are legal."""
    return value if value in ("paused", "completed") else "active"


def membership_after_create() -> AppError:
    """The one error of `createGroup` no repository rule produces."""
    return AppError("INTERNAL_ERROR", GROUP_MEMBERSHIP_AFTER_CREATE)
