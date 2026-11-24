"""Readable validation issues of a brick draft (SPEC-501 ET-4/ET-5).

Every issue carries a stable code, a JSON path and an English message, so the tutor loop (SPEC-508)
can send one complete correction back to a model (BR-IA-11). Nothing here is user-facing.
"""

from collections.abc import Iterable, Sequence
from typing import Any

BRICK_ISSUE_CODES = (
    "SCHEMA_INVALID",
    "CHOICE_NO_CORRECT",
    "CHOICE_SINGLE_NEEDS_ONE",
    "CHOICE_ALL_CORRECT",
    "DISTRACTOR_NOTION_MISSING",
    "DUPLICATE_OPTION",
    "DUPLICATE_ID",
    "CLOZE_GAP_MISMATCH",
    "CLOZE_ANSWER_LEAK",
    "MATCHING_DUPLICATE",
    "ORDERING_DUPLICATE",
    "CATEGORY_EMPTY",
    "CATEGORY_UNKNOWN",
    "CRITERIA_POINTS_MISMATCH",
    "TABLE_CHECK_COLUMN_UNKNOWN",
    "TABLE_OPTIONS_INVALID",
    "SCORING_SUM_MISMATCH",
    "TIMER_SCOPE_INVALID",
    "HTML_NOT_ALLOWED",
    "NOTION_REQUIRED",
    "ORIGIN_INVALID",
    "SOURCES_REQUIRED",
    "NOTION_NOT_FOUND",
    "SOURCE_NOT_FOUND",
    "RESOURCE_NOT_FOUND",
    "CHUNK_RESOURCE_MISMATCH",
    "LOCATION_INVALID",
    "BRICK_REF_NOT_FOUND",
)
"""Every issue code of ET-4 and ET-5, plus `SCHEMA_INVALID` (28 codes)."""


def brick_issue(code: str, path: str, message: str) -> dict[str, str]:
    """One readable validation issue: stable code, JSON path and English message."""
    if code not in BRICK_ISSUE_CODES:
        raise ValueError(f"unknown brick issue code: {code}")
    return {"code": code, "path": path, "message": message}


def unique_issues(issues: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    """Removes exact duplicates while keeping the first occurrence order."""
    seen: set[tuple[str, str, str]] = set()
    result: list[dict[str, str]] = []
    for issue in issues:
        key = (issue["code"], issue["path"], issue["message"])
        if key in seen:
            continue
        seen.add(key)
        result.append(issue)
    return result


def codes_of(issues: Sequence[Any]) -> list[str]:
    """The issue codes in order, for the tests and the diagnostics."""
    return [issue["code"] for issue in issues]


__all__ = ["BRICK_ISSUE_CODES", "brick_issue", "codes_of", "unique_issues"]
