"""[SPEC-2202] Retention at one and two months (SPEC-408)."""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.learning.domain.retention import calculate_retention

pytestmark = pytest.mark.spec("SPEC-2202")

CASES = [
    case
    for case in json.loads(
        (Path(__file__).resolve().parents[2] / "fixtures" / "learning_engine_domain.json").read_text(
            encoding="utf-8"
        )
    )
    if case["key"].startswith("retention.")
]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["key"])
def test_retention_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    data = case["input"]
    params = data.get("params") or {}
    horizons = calculate_retention(
        data["modules"],
        data["reviews"],
        data["at"],
        data.get("timeZone", "UTC"),
        params.get("horizonsDays", (30, 60)),
        params.get("toleranceDays", 3),
    )
    assert [horizon.to_dict() for horizon in horizons] == case["output"]


def test_a_horizon_without_reviewed_notion_has_a_null_rate() -> None:
    horizons = calculate_retention([], [], "2026-11-11T12:20:00.000Z")
    assert [horizon.rate for horizon in horizons] == [None, None]
    assert [horizon.horizon_days for horizon in horizons] == [30, 60]


def test_the_first_review_of_the_window_is_the_one_kept() -> None:
    horizons = calculate_retention(
        [{"moduleId": "m1", "validatedAt": "2026-10-01T08:00:00.000Z", "notionIds": ["n1"]}],
        [
            {"reviewId": "r1", "notionId": "n1", "reviewedAt": "2026-11-01T09:00:00.000Z", "correct": True},
            {"reviewId": "r2", "notionId": "n1", "reviewedAt": "2026-11-02T09:00:00.000Z", "correct": False},
        ],
        "2026-11-11T12:20:00.000Z",
    )
    assert horizons[0].reviewed == 1
    assert horizons[0].successful == 1
