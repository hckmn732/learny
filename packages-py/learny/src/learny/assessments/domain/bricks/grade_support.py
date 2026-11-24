"""Shared helpers of the six grade modules: rounding, outcome assembly and response issues.

Pure and synchronous; importing a model SDK here is forbidden by the architecture test (CA-7). They
live in their own module so the type graders and the dispatcher never form an import cycle.
"""

import math
from collections.abc import Mapping, Sequence
from typing import Any

from learny.shared.errors import AppError
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import assessments as texts

EPSILON = 2.220446049250313e-16
"""`Number.EPSILON`, added by `round2` before rounding."""


class BrickGradeError(Exception):
    """A response that cannot be graded: stable code plus one readable issue per field."""

    def __init__(self, code: str, issues: Sequence[Mapping[str, str]]) -> None:
        super().__init__(code)
        self.code = code
        self.issues: list[dict[str, str]] = [dict(issue) for issue in issues]


def _js_number(value: float) -> float | int:
    """An integral float back to int, as JavaScript has a single number type."""
    return int(value) if math.isfinite(value) and float(value).is_integer() else value


def round4(value: float) -> float | int:
    """Rounds to 4 decimals, half up (ET-3). Scores are never negative."""
    return _js_number(js_round(value * 10_000) / 10_000)


def round2(value: float) -> float | int:
    """Rounds points to 2 decimals, half up (ET-5)."""
    return _js_number(js_round((value + EPSILON) * 100) / 100)


def clamp_score(value: float) -> float:
    """Clamps a success ratio to [0, 1]; a non-finite value counts as zero."""
    if not math.isfinite(value):
        return 0.0
    return min(1.0, max(0.0, value))


def feedback_title(is_correct: bool) -> str:
    """The French feedback title shown to the learner (EF-1)."""
    return texts.GRADE_FEEDBACK_EXACT if is_correct else texts.GRADE_FEEDBACK_APPROXIMATE


def dedupe_confusions(confusions: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    """Removes duplicate confusion pairs, keeping the first occurrence order (ET-2)."""
    seen: set[tuple[str, str]] = set()
    result: list[dict[str, str]] = []
    for confusion in confusions:
        key = (confusion["notionId"], confusion["confusedWithNotionId"])
        if key in seen:
            continue
        seen.add(key)
        result.append(
            {
                "notionId": confusion["notionId"],
                "confusedWithNotionId": confusion["confusedWithNotionId"],
            }
        )
    return result


def invalid_response(issues: Sequence[Mapping[str, str]]) -> BrickGradeError:
    """A `RESPONSE_INVALID` grading error carrying every issue of the response."""
    return BrickGradeError("RESPONSE_INVALID", issues)


def graded_by_tutor(type_name: str) -> BrickGradeError:
    """The explicit refusal of BR-BRI-08 (CL-12)."""
    return BrickGradeError(
        "GRADED_BY_TUTOR",
        [
            {
                "path": "type",
                "message": (f'Brick type "{type_name}" is graded by the tutor, not by code (BR-BRI-08).'),
            }
        ],
    )


def outcome(
    *,
    is_correct: bool,
    score: float | int,
    chosen_distractor_notion_id: str | None,
    confusions: Sequence[Mapping[str, str]],
    normalized_response: str,
    correction: Mapping[str, Any],
) -> dict[str, Any]:
    """Assembles an outcome and derives `feedbackTitle` from `isCorrect` (EF-1)."""
    return {
        "isCorrect": is_correct,
        "score": score,
        "chosenDistractorNotionId": chosen_distractor_notion_id,
        "confusions": [dict(confusion) for confusion in confusions],
        "normalizedResponse": normalized_response,
        "correction": dict(correction),
        "feedbackTitle": feedback_title(is_correct),
    }


def clamp_tutor_score(points: float, max_points: float) -> float | int:
    """Bounds a tutor score to the scale fixed at creation and rounds it to 2 decimals (CL-10)."""
    if not math.isfinite(points) or not math.isfinite(max_points) or max_points < 0:
        raise AppError(
            "RESPONSE_INVALID",
            texts.TUTOR_SCORE_NOT_FINITE,
            errors=[{"path": "points", "message": "A finite number is required."}],
        )
    return round2(min(max(points, 0.0), max_points))


__all__ = [
    "EPSILON",
    "BrickGradeError",
    "clamp_score",
    "clamp_tutor_score",
    "dedupe_confusions",
    "feedback_title",
    "graded_by_tutor",
    "invalid_response",
    "outcome",
    "round2",
    "round4",
]
