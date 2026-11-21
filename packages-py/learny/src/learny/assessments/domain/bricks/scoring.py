"""Activity and exercise scales (SPEC-502 ET-5, ADR-0014, BR-PRA-01).

Port of `packages/bricks/src/types/scoring/compute.ts`. Pure functions: the caller passes the
per-brick success ratios in [0, 1] and gets the points, the percentage and the threshold verdict.
"""

import math
from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.domain.bricks.grade_support import clamp_score, round2
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import assessments as texts

EXERCISE_MAX = 10
"""The exercise scale is always out of ten (BR-PRA-01)."""


class ScoringItemUnknownError(Exception):
    """Raised when a weighted scale has no weight for an activity item (ET-5)."""

    code = "SCORING_ITEM_UNKNOWN"

    def __init__(self, brick_id: str) -> None:
        super().__init__(f'No scoring weight for brick "{brick_id}".')
        self.brick_id = brick_id


def compute_activity_score(items: Sequence[Mapping[str, Any]], scoring: Mapping[str, Any]) -> dict[str, Any]:
    """Points, percentage and threshold verdict of one activity (ET-5)."""
    weights = {str(weight["brickId"]): float(weight["points"]) for weight in scoring["weights"]}
    total = float(scoring["total"])
    share = 0.0 if not items else total / len(items)
    raw_points = 0.0
    per_item: list[dict[str, Any]] = []
    for item in items:
        brick_id = str(item["brickId"])
        if scoring["mode"] == "equal":
            maximum: float | None = share
        else:
            maximum = weights.get(brick_id)
        if maximum is None:
            raise ScoringItemUnknownError(brick_id)
        raw_points += maximum * clamp_score(float(item["score"]))
        per_item.append(
            {
                "brickId": brick_id,
                "points": round2(maximum * clamp_score(float(item["score"]))),
                "max": round2(maximum),
            }
        )
    points = round2(raw_points)
    percent = 0 if total == 0 else js_round((raw_points / total) * 100)
    return {
        "points": points,
        "percent": min(100, max(0, percent)),
        "passed": points >= float(scoring["threshold"]),
        "perItem": per_item,
    }


def compute_exercise_score(
    criteria: Sequence[Mapping[str, Any]],
    hints_used: float | int,
    brick: Mapping[str, Any],
) -> dict[str, Any]:
    """Points out of ten, threshold verdict and French verdict of one exercise (ET-5)."""
    succeeded = {str(criterion["key"]) for criterion in criteria if criterion["ok"]}
    earned = sum(
        float(criterion["points"]) for criterion in brick["criteria"] if str(criterion["key"]) in succeeded
    )
    count = math.trunc(hints_used) if math.isfinite(float(hints_used)) else 0
    hints = min(max(count, 0), len(brick["hints"]))
    points = round2(max(0.0, earned - hints))
    passed = points >= float(brick["passPoints"])
    return {
        "points": points,
        "max": EXERCISE_MAX,
        "passed": passed,
        "verdict": (texts.INSTRUCTION_VERDICT_PASSED if passed else texts.INSTRUCTION_VERDICT_FAILED),
    }


__all__ = ["EXERCISE_MAX", "ScoringItemUnknownError", "compute_activity_score", "compute_exercise_score"]
