"""[SPEC-2202] Code correction of the six auto-graded bricks (SPEC-502, BR-BRI-08).

The expected outcomes are the reference recordings: same score, same correction, same confusions and
same normalized response.
"""

import json
import math
from pathlib import Path
from typing import Any

import pytest
from learny.assessments.domain.bricks.grade import grade_brick
from learny.assessments.domain.bricks.grade_support import (
    BrickGradeError,
    clamp_tutor_score,
    feedback_title,
)
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "bricks_contract.json").read_text(encoding="utf-8")
)
GRADES = FIXTURE["grades"]
ERRORS = FIXTURE["gradeErrors"]
PAYLOADS = {type_name: entry["normalized"] for type_name, entry in FIXTURE["examples"].items()}


@pytest.mark.parametrize("case", GRADES, ids=[case["name"] for case in GRADES])
def test_the_outcome_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    assert grade_brick(case["type"], case["payload"], case["response"], case["seed"]) == case["outcome"]


@pytest.mark.parametrize("case", ERRORS, ids=[case["name"] for case in ERRORS])
def test_an_invalid_response_keeps_the_code_and_the_paths(case: dict[str, Any]) -> None:
    with pytest.raises(BrickGradeError) as refused:
        grade_brick(case["type"], case["payload"], case["response"], case["seed"])
    assert refused.value.code == case["code"]
    assert sorted(issue["path"] for issue in refused.value.issues) == case["paths"]


@pytest.mark.parametrize("case", FIXTURE["tutorScores"], ids=["seven", "negative", "too-big", "zero", "two"])
def test_the_tutor_score_is_bounded_and_rounded(case: dict[str, Any]) -> None:
    assert clamp_tutor_score(case["points"], case["maxPoints"]) == case["value"]


@pytest.mark.parametrize("points", [math.inf, -math.inf, math.nan])
def test_a_non_finite_tutor_score_is_refused(points: float) -> None:
    with pytest.raises(AppError) as refused:
        clamp_tutor_score(points, 10)
    assert refused.value.code == "RESPONSE_INVALID"


def test_a_negative_scale_is_refused() -> None:
    with pytest.raises(AppError) as refused:
        clamp_tutor_score(3, -1)
    assert refused.value.code == "RESPONSE_INVALID"


def test_the_feedback_title_is_the_french_contract() -> None:
    assert feedback_title(True) == texts.GRADE_FEEDBACK_EXACT
    assert feedback_title(False) == texts.GRADE_FEEDBACK_APPROXIMATE


@pytest.mark.parametrize("type_name", ["open_question", "instruction", "scripted_dialogue"])
def test_the_three_tutor_graded_types_are_refused(type_name: str) -> None:
    with pytest.raises(BrickGradeError) as refused:
        grade_brick(type_name, PAYLOADS[type_name], {}, "seed")
    assert refused.value.code == "GRADED_BY_TUTOR"
    assert refused.value.issues == [
        {
            "path": "type",
            "message": (f'Brick type "{type_name}" is graded by the tutor, not by code (BR-BRI-08).'),
        }
    ]


@pytest.mark.parametrize("type_name", ["text", "resource_excerpt", "timer", "scoring"])
def test_a_type_without_code_correction_is_refused(type_name: str) -> None:
    with pytest.raises(BrickGradeError) as refused:
        grade_brick(type_name, PAYLOADS[type_name], {}, "seed")
    assert refused.value.code == "RESPONSE_INVALID"
    assert refused.value.issues == [
        {"path": "type", "message": f'Brick type "{type_name}" has no code correction.'}
    ]


def test_a_single_choice_is_all_or_nothing() -> None:
    outcome = grade_brick("choice_question", PAYLOADS["choice_question"], {"optionIds": ["b"]}, "seed")
    assert outcome["isCorrect"] is False
    assert outcome["score"] == 0


def test_the_multiple_choice_formula_never_goes_below_zero() -> None:
    payload = json.loads(json.dumps(PAYLOADS["choice_question"]))
    payload["mode"] = "multiple"
    payload["options"][1]["correct"] = True
    outcome = grade_brick("choice_question", payload, {"optionIds": ["c"]}, "seed")
    assert outcome["score"] == 0
    assert outcome["isCorrect"] is False


def test_the_chosen_distractor_is_the_first_one_in_the_option_order() -> None:
    outcome = grade_brick("choice_question", PAYLOADS["choice_question"], {"optionIds": ["c"]}, "seed")
    expected = next(
        option
        for option in PAYLOADS["choice_question"]["options"]
        if not option["correct"] and option["id"] == "c"
    )
    assert outcome["chosenDistractorNotionId"] == expected["notionId"]


@pytest.mark.parametrize("case", GRADES, ids=[case["name"] for case in GRADES])
def test_the_confusions_are_deduplicated(case: dict[str, Any]) -> None:
    confusions = case["outcome"]["confusions"]
    keys = [(confusion["notionId"], confusion["confusedWithNotionId"]) for confusion in confusions]
    assert len(keys) == len(set(keys))


@pytest.mark.parametrize("case", GRADES, ids=[case["name"] for case in GRADES])
def test_the_score_is_always_within_the_unit_interval(case: dict[str, Any]) -> None:
    score = case["outcome"]["score"]
    assert 0 <= score <= 1
