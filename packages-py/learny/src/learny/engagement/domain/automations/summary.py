"""Rules of the one-line summary of an action (SPEC-2205, ET-3 of SPEC-711).

Ported from `AutomationSummary` of `packages/contracts/src/moteur-d-automatismes.ts`: the summary is
trimmed, never empty, at most 160 characters and never spans two lines. `clip` is the truncation of
the definitions that build a long sentence; `status_prefix` is the « Annule » / « Refuse » prefix
the journal reads after a decision (EF-8). The French text lives in `locale_fr` (ADR-2011).
"""

from typing import Any, Final

from learny.engagement.domain.automations.keys import SUMMARY_MAX
from learny.shared.locale_fr import engagement_automations as fr

_STATUS_PREFIXES: Final = {
    "undone": fr.SUMMARY_UNDONE_PREFIX,
    "declined": fr.SUMMARY_DECLINED_PREFIX,
}


class SummaryError(ValueError):
    """The summary violates the contract; the caller turns it into a `VALIDATION_FAILED`."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def clip(value: str) -> str:
    """`pauseSummary`'s truncation: 159 characters then the ellipsis, never a trailing space."""
    if len(value) <= SUMMARY_MAX:
        return value
    return f"{value[: SUMMARY_MAX - 1].rstrip()}{fr.SUMMARY_ELLIPSIS}"


def status_prefix(status: str) -> str:
    """EF-8 - the prefix of a decided action, or the empty string."""
    return _STATUS_PREFIXES.get(status, "")


def explain_line(text: str, status: str) -> str:
    """One journal line for a decided action, clipped to the 160 characters of the contract."""
    return clip(f"{status_prefix(status)}{text}")


def _received(value: Any) -> str:
    """The type name zod prints in its messages, for the few values a draft can carry."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def normalize_summary(value: Any) -> str:
    """Validates and trims one summary; raises `SummaryError` with the contract message."""
    if not isinstance(value, str):
        raise SummaryError(f"Invalid input: expected string, received {_received(value)}")
    trimmed = value.strip()
    if trimmed == "":
        raise SummaryError("Too small: expected string to have >=1 characters")
    if len(trimmed) > SUMMARY_MAX:
        raise SummaryError(f"Too big: expected string to have <={SUMMARY_MAX} characters")
    if "\r" in trimmed or "\n" in trimmed:
        raise SummaryError(fr.SUMMARY_ONE_LINE)
    return trimmed
