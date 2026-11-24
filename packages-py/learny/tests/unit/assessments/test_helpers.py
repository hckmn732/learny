"""[SPEC-2202] Helpers of the brick contract (SPEC-502 ET-1, ET-4, ET-5, EF-7, EF-10).

Every expected value is the reference recordings.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.assessments.domain.bricks.grade_support import BrickGradeError
from learny.assessments.domain.bricks.instruction import parse_instruction_response
from learny.assessments.domain.bricks.scoring import (
    ScoringItemUnknownError,
    compute_activity_score,
    compute_exercise_score,
)
from learny.assessments.domain.bricks.table_checks import (
    evaluate_table_checks,
    format_french_number,
    parse_french_number,
)
from learny.assessments.domain.bricks.timer import format_remaining, timer_state

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "bricks_helpers.json").read_text(encoding="utf-8")
)


@pytest.mark.parametrize(
    "case", FIXTURE["numbers"], ids=[case["input"] or "empty" for case in FIXTURE["numbers"]]
)
def test_a_french_number_is_parsed_like_intl(case: dict[str, Any]) -> None:
    assert parse_french_number(case["input"]) == case["value"]


@pytest.mark.parametrize(
    "case", FIXTURE["formatted"], ids=[str(case["input"]) for case in FIXTURE["formatted"]]
)
def test_a_number_is_formatted_like_intl(case: dict[str, Any]) -> None:
    assert format_french_number(case["input"]) == case["output"]


def test_the_french_group_separator_is_the_narrow_no_break_space() -> None:
    assert "\u202f" in format_french_number(1234.5)
    assert format_french_number(1234.5).endswith(",5")


def test_a_plain_integer_has_no_decimal_part() -> None:
    assert format_french_number(7) == "7"
    assert parse_french_number("7") == 7


@pytest.mark.parametrize(
    "case", FIXTURE["tableChecks"], ids=[case["name"] for case in FIXTURE["tableChecks"]]
)
def test_the_table_check_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    assert evaluate_table_checks(case["production"], case["values"]) == case["output"]


def test_an_empty_table_is_reported_as_empty() -> None:
    case = next(case for case in FIXTURE["tableChecks"] if case["name"] == "empty")
    result = evaluate_table_checks(case["production"], case["values"])
    assert [entry["state"] for entry in result] == ["empty" for _ in result]


def test_the_side_of_each_row_is_labelled() -> None:
    case = next(case for case in FIXTURE["tableChecks"] if case["name"] == "unbalanced")
    result = evaluate_table_checks(case["production"], case["values"])
    labels = {check.get("leftLabel") for check in case["production"]["checks"]} | {
        check.get("rightLabel") for check in case["production"]["checks"]
    }
    assert any(entry is not None for entry in result[0]["sideByRow"])
    assert all(entry is None or entry in labels for entry in result[0]["sideByRow"])


@pytest.mark.parametrize(
    "case", FIXTURE["remaining"], ids=[str(case["input"]) for case in FIXTURE["remaining"]]
)
def test_the_remaining_time_is_displayed(case: dict[str, Any]) -> None:
    assert format_remaining(case["input"]) == case["output"]


def test_the_remaining_time_never_goes_negative() -> None:
    assert format_remaining(-5) == "00:00"


@pytest.mark.parametrize("case", FIXTURE["timer"], ids=[case["name"] for case in FIXTURE["timer"]])
def test_the_timer_state_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    state = timer_state(
        started_at_ms=case["startedAt"],
        duration_sec=case["durationSec"],
        warn_at_sec=case["warnAtSec"],
        now_ms=case["now"],
    )
    assert state == case["output"]


def test_a_clock_set_back_never_grants_more_than_the_duration() -> None:
    state = timer_state(started_at_ms=1_000_000, duration_sec=600, warn_at_sec=60, now_ms=0)
    assert state["remainingMs"] == 600_000
    assert state["expired"] is False


def test_the_warning_is_strictly_under_the_threshold() -> None:
    started = 1_000_000
    under = timer_state(started_at_ms=started, duration_sec=3600, warn_at_sec=300, now_ms=started + 3_300_001)
    exact = timer_state(started_at_ms=started, duration_sec=3600, warn_at_sec=300, now_ms=started + 3_300_000)
    assert under["warning"] is True
    assert exact["warning"] is False


@pytest.mark.parametrize("case", FIXTURE["activities"], ids=[case["name"] for case in FIXTURE["activities"]])
def test_the_activity_score_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    if not case["ok"]:
        with pytest.raises(ScoringItemUnknownError) as refused:
            compute_activity_score(case["items"], case["scoring"])
        assert refused.value.code == case["code"]
        assert refused.value.brick_id == case["brickId"]
        return
    assert compute_activity_score(case["items"], case["scoring"]) == case["output"]


def test_an_unknown_weight_is_the_documented_error() -> None:
    case = next(case for case in FIXTURE["activities"] if not case["ok"])
    with pytest.raises(ScoringItemUnknownError) as refused:
        compute_activity_score(case["items"], case["scoring"])
    assert str(refused.value) == f'No scoring weight for brick "{case["brickId"]}".'


def test_the_percentage_is_clamped_between_zero_and_one_hundred() -> None:
    for case in FIXTURE["activities"]:
        if not case["ok"]:
            continue
        percent = compute_activity_score(case["items"], case["scoring"])["percent"]
        assert 0 <= percent <= 100


@pytest.mark.parametrize("case", FIXTURE["exercises"], ids=[case["name"] for case in FIXTURE["exercises"]])
def test_the_exercise_score_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    result = compute_exercise_score(case["criteria"], case["hintsUsed"], case["brick"])
    assert result == case["output"]
    assert result["max"] == 10


def test_an_exercise_is_never_negative() -> None:
    case = next(case for case in FIXTURE["exercises"] if case["name"] == "none-ok")
    result = compute_exercise_score(case["criteria"], 5, case["brick"])
    assert result["points"] == 0
    assert result["passed"] is False


@pytest.mark.parametrize("case", FIXTURE["responses"], ids=[case["name"] for case in FIXTURE["responses"]])
def test_an_instruction_response_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    if not case["ok"]:
        with pytest.raises(BrickGradeError) as refused:
            parse_instruction_response(case["production"], case["response"])
        assert sorted(issue["path"] for issue in refused.value.issues) == case["paths"]
        return
    assert parse_instruction_response(case["production"], case["response"]) == case["output"]


def test_the_explanation_is_optional() -> None:
    case = next(case for case in FIXTURE["responses"] if case["name"] == "link-ok")
    parsed = parse_instruction_response(case["production"], case["response"])
    assert "explanation" not in parsed
    with_explanation = parse_instruction_response(
        case["production"], {**case["response"], "explanation": "  La preuve.  "}
    )
    assert with_explanation["explanation"] == "La preuve."


def test_a_link_must_use_https() -> None:
    case = next(case for case in FIXTURE["responses"] if case["name"] == "link-not-https")
    with pytest.raises(BrickGradeError) as refused:
        parse_instruction_response(case["production"], case["response"])
    assert refused.value.issues == [{"path": "response.url", "message": "The link must use HTTPS."}]


def test_a_table_outside_the_row_bounds_is_refused() -> None:
    case = next(case for case in FIXTURE["responses"] if case["name"] == "table-too-few-rows")
    with pytest.raises(BrickGradeError) as refused:
        parse_instruction_response(case["production"], case["response"])
    assert [issue["path"] for issue in refused.value.issues] == ["response.rows"]
