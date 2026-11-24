"""Retention at one and two months (SPEC-408 ET-1, BR-MEM-06, ADR-0210, ADR-0283).

Pure: the evaluation instant, the learner's time zone and the business bounds come from the
caller. Each notion contributes at most once per horizon: its first review inside the window after
its module validation, which measures recall before the repetitions of the window.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from learny.learning.domain.errors import invalid_input
from learny.learning.domain.time import days_between, local_date_of, parse_instant

DEFAULT_RETENTION_HORIZONS = (30, 60)
DEFAULT_RETENTION_TOLERANCE_DAYS = 3


@dataclass(frozen=True, slots=True)
class RetentionModule:
    """A validated module and the notions it taught."""

    module_id: str
    validated_at: str | None
    notion_ids: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RetentionReview:
    """One review log line: the notion reviewed, its instant and whether recall succeeded."""

    review_id: str
    notion_id: str
    reviewed_at: str
    correct: bool


@dataclass(frozen=True, slots=True)
class RetentionHorizon:
    """One horizon (30 or 60 days) after module validation, with its inclusive window."""

    horizon_days: int
    window_start_days: int
    window_end_days: int
    eligible: int
    reviewed: int
    successful: int
    rate: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "horizonDays": self.horizon_days,
            "windowStartDays": self.window_start_days,
            "windowEndDays": self.window_end_days,
            "eligible": self.eligible,
            "reviewed": self.reviewed,
            "successful": self.successful,
            "rate": self.rate,
        }


@dataclass(frozen=True, slots=True)
class _NotionValidation:
    notion_id: str
    module_id: str
    validated_on: str


def _read_module(raw: Any, index: int) -> RetentionModule:
    if not isinstance(raw, dict):
        raise invalid_input(f"modules.{index}", "A module object is required.")
    module_id = raw.get("moduleId")
    if not isinstance(module_id, str) or not 1 <= len(module_id) <= 64:
        raise invalid_input(f"modules.{index}.moduleId", "Invalid identifier.")
    validated_at = raw.get("validatedAt")
    if validated_at is not None and not isinstance(validated_at, str):
        raise invalid_input(f"modules.{index}.validatedAt", "Invalid instant.")
    notion_ids = raw.get("notionIds")
    if not isinstance(notion_ids, (list, tuple)):
        raise invalid_input(f"modules.{index}.notionIds", "An array of identifiers is required.")
    return RetentionModule(
        module_id=module_id,
        validated_at=validated_at,
        notion_ids=tuple(str(notion) for notion in notion_ids),
    )


def _read_review(raw: Any, index: int) -> RetentionReview:
    if not isinstance(raw, dict):
        raise invalid_input(f"reviews.{index}", "A review object is required.")
    review_id, notion_id = raw.get("reviewId"), raw.get("notionId")
    if not isinstance(review_id, str) or not 1 <= len(review_id) <= 64:
        raise invalid_input(f"reviews.{index}.reviewId", "Invalid identifier.")
    if not isinstance(notion_id, str) or not 1 <= len(notion_id) <= 64:
        raise invalid_input(f"reviews.{index}.notionId", "Invalid identifier.")
    reviewed_at = raw.get("reviewedAt")
    if not isinstance(reviewed_at, str):
        raise invalid_input(f"reviews.{index}.reviewedAt", "Invalid instant.")
    correct = raw.get("correct")
    if not isinstance(correct, bool):
        raise invalid_input(f"reviews.{index}.correct", "A boolean is required.")
    return RetentionReview(review_id=review_id, notion_id=notion_id, reviewed_at=reviewed_at, correct=correct)


def _notion_validations(modules: Sequence[RetentionModule], time_zone: str) -> dict[str, _NotionValidation]:
    """Maps each notion to the earliest validated module that teaches it."""
    result: dict[str, _NotionValidation] = {}
    for module in sorted(modules, key=lambda item: item.module_id):
        if module.validated_at is None:
            continue
        validated_on = local_date_of(module.validated_at, time_zone)
        for notion_id in sorted(set(module.notion_ids)):
            current = result.get(notion_id)
            if (
                current is None
                or validated_on < current.validated_on
                or (validated_on == current.validated_on and module.module_id < current.module_id)
            ):
                result[notion_id] = _NotionValidation(
                    notion_id=notion_id, module_id=module.module_id, validated_on=validated_on
                )
    return result


def _review_sort_key(review: RetentionReview) -> tuple[str, str, str, int]:
    return (review.reviewed_at, review.review_id, review.notion_id, 1 if review.correct else 0)


def _unique_reviews(reviews: Sequence[RetentionReview]) -> list[RetentionReview]:
    """Drops a replayed review identifier, keeping the canonically first line (ET-3)."""
    seen: set[str] = set()
    result: list[RetentionReview] = []
    for review in sorted(reviews, key=_review_sort_key):
        if review.review_id in seen:
            continue
        seen.add(review.review_id)
        result.append(review)
    return result


def calculate_retention(
    modules: Sequence[Any],
    reviews: Sequence[Any],
    at: str,
    time_zone: str = "UTC",
    horizons_days: Sequence[int] = DEFAULT_RETENTION_HORIZONS,
    tolerance_days: int = DEFAULT_RETENTION_TOLERANCE_DAYS,
) -> list[RetentionHorizon]:
    """BR-MEM-06: share of successful notions among those reviewed inside the window."""
    if not horizons_days or any(not isinstance(day, int) or day < 1 for day in horizons_days):
        raise invalid_input("params.horizonsDays", "A non-empty array of positive integers is required.")
    if not isinstance(tolerance_days, int) or tolerance_days < 0:
        raise invalid_input("params.toleranceDays", "A non-negative integer is required.")
    if tolerance_days >= min(horizons_days):
        raise invalid_input("params.toleranceDays", "The tolerance must stay below the smallest horizon.")
    parsed_modules = [_read_module(raw, index) for index, raw in enumerate(modules)]
    parsed_reviews = [_read_review(raw, index) for index, raw in enumerate(reviews)]
    horizons = sorted(set(horizons_days))
    validations = _notion_validations(parsed_modules, time_zone)
    at_day = local_date_of(at, time_zone)
    unique = _unique_reviews(parsed_reviews)
    at_ms = parse_instant(at)

    results: list[RetentionHorizon] = []
    for horizon_days in horizons:
        window_start = horizon_days - tolerance_days
        window_end = horizon_days + tolerance_days
        eligible = 0
        for validation in validations.values():
            if days_between(validation.validated_on, at_day) >= window_start:
                eligible += 1
        selected: dict[str, RetentionReview] = {}
        for review in unique:
            if parse_instant(review.reviewed_at) > at_ms:
                continue
            notion_validation = validations.get(review.notion_id)
            if notion_validation is None:
                continue
            age_days = days_between(
                notion_validation.validated_on, local_date_of(review.reviewed_at, time_zone)
            )
            if age_days < window_start or age_days > window_end:
                continue
            if review.notion_id not in selected:
                selected[review.notion_id] = review
        successful = sum(1 for review in selected.values() if review.correct)
        reviewed = len(selected)
        results.append(
            RetentionHorizon(
                horizon_days=horizon_days,
                window_start_days=window_start,
                window_end_days=window_end,
                eligible=eligible,
                reviewed=reviewed,
                successful=successful,
                rate=None if reviewed == 0 else (successful / reviewed) * 100,
            )
        )
    return results
