"""Pure score of a validation attempt (SPEC-611 EF-9, ET-3, ADR-0014, ADR-0170).

Port of `packages/services/src/quiz/score.ts`: no IO, no clock. A question is worth `maxScore`
points; the global score is the earned share of the 100-point scale, rounded to two decimals.
`perNotion` averages the success ratio of the questions attached to the notion.
"""

import math
from collections.abc import Mapping, Sequence
from typing import Any

from learny.shared.jsmath import js_round


def round2(value: float) -> float:
    """`round2`: two decimals, halves away from zero like `Math.round`."""
    return js_round(value * 100) / 100


def bounded(value: float, maximum: float) -> float:
    """`bounded`: zero for a non-finite value or a non-positive scale, clamped otherwise."""
    if maximum <= 0:
        return 0
    return min(max(value, 0), maximum)


def compute_score(answers: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """EF-9 - 100 points spread over the questions, proportional on a partial answer."""
    ordered = sorted(answers, key=lambda answer: int(answer["position"]))
    earned = 0.0
    possible = 0.0
    by_notion: dict[str, dict[str, Any]] = {}
    for answer in ordered:
        max_score = float(answer["maxScore"]) if float(answer["maxScore"]) > 0 else 0.0
        score = bounded(float(answer["score"]), max_score)
        earned += score
        possible += max_score
        entry = by_notion.setdefault(str(answer["notionId"]), {"correct": 0, "total": 0, "ratio": 0.0})
        entry["total"] += 1
        if answer["isCorrect"] is True:
            entry["correct"] += 1
        entry["ratio"] += score / max_score if max_score > 0 else 0.0
    score = round2((earned / possible) * 100) if possible > 0 else 0
    per_notion: dict[str, dict[str, Any]] = {}
    for notion_id, entry in by_notion.items():
        total = int(entry["total"])
        per_notion[notion_id] = {
            "correct": int(entry["correct"]),
            "total": total,
            "score": round2((entry["ratio"] / total) * 100) if total > 0 else 0,
        }
    return {"score": score, "perNotion": per_notion}


def is_passed(score: float, threshold: float) -> bool:
    """ADR-0170 section 5 - the unrounded score is compared with the module threshold."""
    return score >= threshold


def points_missing(score: float, threshold: float) -> int:
    """CL-11 - the gap to the threshold, rounded up on the unrounded score."""
    if score >= threshold:
        return 0
    return max(0, math.ceil(threshold - score))


__all__ = ["bounded", "compute_score", "is_passed", "points_missing", "round2"]
