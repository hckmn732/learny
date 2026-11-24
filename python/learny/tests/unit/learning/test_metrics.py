"""[SPEC-2202] Progress indicators of a formation (SPEC-408 ET-2)."""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.learning.domain.progress import calculate_progress

pytestmark = pytest.mark.spec("SPEC-2202")

CASES = [
    case
    for case in json.loads(
        (Path(__file__).resolve().parents[2] / "fixtures" / "learning_engine_domain.json").read_text(
            encoding="utf-8"
        )
    )
    if case["key"].startswith("progress.")
]


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["key"])
def test_progress_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    data = case["input"]
    result = calculate_progress(
        data["modules"], data["slots"], data["notionStates"], data.get("masteryThreshold")
    )
    assert result.to_dict() == case["output"]


def test_no_module_is_a_dedicated_status() -> None:
    result = calculate_progress([], [], [])
    assert result.status == "no_modules"
    assert result.progress_percent == 0
