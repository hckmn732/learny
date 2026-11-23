"""[SPEC-2202] Detection, nature and clearance of gaps (SPEC-404, BR-LAC-02 to BR-LAC-06).

The expected values, evidence lines included, are the reference recordings.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.gaps import (
    clear_gap,
    detect_gap,
    gap_error_key,
    is_gap_failure,
    is_gap_success,
    normalize_error,
)

pytestmark = pytest.mark.spec("SPEC-2202")

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "learning_engine_gaps.json").read_text(
        encoding="utf-8"
    )
)
DETECT = CASES["detect"]
CLEAR = CASES["clear"]


@pytest.mark.parametrize("case", DETECT, ids=lambda case: f"detect-{DETECT.index(case)}")
def test_detect_gap_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    data = case["input"]
    result = detect_gap(
        data["notion"],
        data["attempts"],
        data["mastery"],
        data["now"],
        data.get("existingGap"),
        data.get("fsrsLapsed", False),
        data.get("params"),
    )
    assert result == case["output"]


@pytest.mark.parametrize("case", CLEAR, ids=lambda case: f"clear-{CLEAR.index(case)}")
def test_clear_gap_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    data = case["input"]
    result = clear_gap(
        data["gap"],
        data["successes"],
        data["mastery"],
        data["now"],
        data.get("notion"),
        data.get("params"),
    )
    assert result == case["output"]


def test_normalize_error_ignores_accents_case_and_spaces() -> None:
    assert normalize_error("  \u00c9l\u00c8VE   confus\u0301e ") == "eleve confuse"
    assert normalize_error("A  b") == "a b"


def test_gap_failure_and_success_are_duals_for_graded_answers() -> None:
    graded = {"correct": None, "score": 1, "maxScore": 4}
    assert is_gap_failure(graded) is True
    assert is_gap_success(graded) is False
    assert is_gap_failure({**graded, "score": 2}) is False
    assert is_gap_success({**graded, "score": 2}) is True


def test_the_error_key_follows_the_answer_identity() -> None:
    assert gap_error_key({"chosenDistractorNotionId": "n2"}) == "distractor:n2"
    assert gap_error_key({"chosenDistractorNotionId": None, "confusedWithNotionId": "n3"}) == "confusion:n3"
    assert (
        gap_error_key(
            {
                "chosenDistractorNotionId": None,
                "confusedWithNotionId": None,
                "normalizedResponse": "  Hors   Sujet ",
                "format": "open_question",
            }
        )
        == "response:hors sujet"
    )
    assert gap_error_key({"chosenDistractorNotionId": None, "normalizedResponse": None}) is None


def test_a_confused_notion_only_belongs_to_a_confusion_gap() -> None:
    with pytest.raises(EngineError) as refused:
        detect_gap(
            "n1",
            [],
            0,
            "2026-11-11T12:20:00.000Z",
            {
                "nature": "forgetting",
                "confusedWith": "n2",
                "detectedAt": "2026-11-01T09:00:00.000Z",
                "evidence": "Lapse FSRS signale.",
                "clearedAt": None,
            },
        )
    assert refused.value.code == "INVALID_INPUT"
