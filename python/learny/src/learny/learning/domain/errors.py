"""Contract errors of the pure engine (SPEC-401 ET-6, ADR-0140).

Every invalid input raises `EngineError` with a stable code and, when the cause is a field, its
dot-separated path. No other exception leaves a public function of the engine. Messages are
internal (a failed engine call becomes an unexpected 500 in the HTTP contract), hence English.
"""

from typing import Any

INVALID_INPUT = "INVALID_INPUT"
INVALID_INSTANT = "INVALID_INSTANT"
INVALID_PARAM = "INVALID_PARAM"
REVIEW_OUT_OF_ORDER = "REVIEW_OUT_OF_ORDER"
UNKNOWN_NOTION = "UNKNOWN_NOTION"
INVALID_AVAILABILITY = "INVALID_AVAILABILITY"

ERROR_CODES = frozenset(
    {
        INVALID_INPUT,
        INVALID_INSTANT,
        INVALID_PARAM,
        REVIEW_OUT_OF_ORDER,
        UNKNOWN_NOTION,
        INVALID_AVAILABILITY,
    }
)


class EngineError(Exception):
    """A business error of the pure engine carrying a stable code and an optional path."""

    def __init__(self, code: str, message: str, path: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.path = path

    def details(self) -> dict[str, Any]:
        """The `details` payload of the error, key order preserved."""
        return {} if self.path is None else {"path": self.path}

    def __str__(self) -> str:
        return self.message


def invalid_input(path: str, message: str) -> EngineError:
    """`INVALID_INPUT` on a field, as every engine validator raises it."""
    return EngineError(INVALID_INPUT, message, path)


def invalid_param(path: str, message: str) -> EngineError:
    """`INVALID_PARAM` on a configuration field."""
    return EngineError(INVALID_PARAM, message, path)
