"""[SPEC-2202] Planner boundary validation and existing-slot handling (SPEC-407 ET-5, BR-FOR-15)."""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.planner import (
    assert_planner_params,
    assert_preferences,
    find_compatible_slots,
    max_chunk_minutes,
    plan_schedule,
    slot_local_intervals,
)
from learny.learning.domain.time import local_date_of

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "learning_engine_planner.json").read_text(
        encoding="utf-8"
    )
)
INPUTS = FIXTURE["inputs"]
OUTPUT = FIXTURE["output"]
PLAN_INPUTS = {entry["name"]: entry["input"] for entry in INPUTS["plans"]}
PLAN_RESULTS = {entry["name"]: entry["result"] for entry in OUTPUT["plans"]}

NOW = INPUTS["now"]
TZ = INPUTS["tz"]
PARAMS = INPUTS["params"]
AVAILABILITY = INPUTS["availability"]
FORMATIONS = PLAN_INPUTS["base"]["formations"]


def preferences(**overrides: Any) -> dict[str, Any]:
    """The learner preferences of the reference suite, with availability overrides."""
    return {"tz": TZ, "availability": {**AVAILABILITY, **overrides}, "holidays": ["2026-11-11"]}


def plan_input(**overrides: Any) -> dict[str, Any]:
    """One planning input for the validation cases."""
    payload: dict[str, Any] = {
        "formations": [FORMATIONS[0]],
        "preferences": preferences(),
        "params": PARAMS,
        "now": NOW,
    }
    payload.update(overrides)
    return payload


def with_module(**overrides: Any) -> list[dict[str, Any]]:
    """The single-module formation of the reference fixtures with module overrides."""
    formation = {**FORMATIONS[0], "modules": [{**FORMATIONS[0]["modules"][0], **overrides}]}
    return [formation]


def _run(operation: str, case: dict[str, Any]) -> object:
    """Replays one recorded failing call."""
    if operation == "plan":
        return plan_schedule(case["input"])
    return find_compatible_slots(case["activity"], case["calendar"], case["preferences"], case["count"])


@pytest.mark.parametrize(
    "case",
    [case for case in INPUTS["errors"] if case["operation"] in ("plan", "compatible")],
    ids=[case["name"] for case in INPUTS["errors"] if case["operation"] in ("plan", "compatible")],
)
def test_recorded_engine_errors_keep_their_code_and_path(case: dict[str, Any]) -> None:
    with pytest.raises(EngineError) as refused:
        _run(case["operation"], case)
    assert (refused.value.code, refused.value.path) == (case["code"], case["path"])


@pytest.mark.parametrize(
    "case",
    [case for case in INPUTS["errors"] if case["operation"] == "params"],
    ids=[case["name"] for case in INPUTS["errors"] if case["operation"] == "params"],
)
def test_recorded_parameter_errors_keep_their_code_and_path(case: dict[str, Any]) -> None:
    with pytest.raises(EngineError) as refused:
        assert_planner_params(case["input"])
    assert (refused.value.code, refused.value.path) == (case["code"], case["path"])


@pytest.mark.parametrize(
    "case",
    [case for case in INPUTS["errors"] if case["operation"] == "preferences"],
    ids=[case["name"] for case in INPUTS["errors"] if case["operation"] == "preferences"],
)
def test_recorded_preference_errors_keep_their_code_and_path(case: dict[str, Any]) -> None:
    with pytest.raises(EngineError) as refused:
        assert_preferences(case["input"])
    assert (refused.value.code, refused.value.path) == (case["code"], case["path"])


def test_the_engine_parameters_are_accepted() -> None:
    params = assert_planner_params(PARAMS)
    assert params.granularity_minutes == PARAMS["granularityMinutes"]
    assert params.buffer_minutes == PARAMS["bufferMinutes"]
    assert params.moments["soir"].start == 18 * 60 + 30


def test_preferences_accept_a_valid_holiday() -> None:
    parsed = assert_preferences({**preferences(), "holidays": ["2026-12-25"]})
    assert parsed.holidays == ("2026-12-25",)
    assert parsed.tz == TZ


@pytest.mark.parametrize("case", INPUTS["helpers"], ids=[case["name"] for case in INPUTS["helpers"]])
def test_the_longest_block_is_the_longest_preferred_moment(case: dict[str, Any]) -> None:
    params = assert_planner_params(PARAMS)
    assert max_chunk_minutes(params, case["slots"]) == case["value"]


def test_the_longest_block_is_never_below_the_granularity() -> None:
    params = assert_planner_params(PARAMS)
    assert max_chunk_minutes(params, []) == params.granularity_minutes
    assert max_chunk_minutes(params, ["matin"]) >= params.granularity_minutes


def test_a_bad_module_field_is_refused() -> None:
    with pytest.raises(EngineError) as refused:
        plan_schedule(plan_input(formations=with_module(hours=0)))
    assert refused.value.path == "formations.modules.hours"


def test_a_broken_existing_slot_is_refused() -> None:
    case = next(case for case in INPUTS["errors"] if case["name"] == "brokenExistingSlot")
    with pytest.raises(EngineError) as refused:
        plan_schedule(case["input"])
    assert refused.value.code == "INVALID_INSTANT"


def test_cancelled_and_moved_slots_are_kept_without_conflict() -> None:
    result = plan_schedule(PLAN_INPUTS["cancelledAndMoved"])
    statuses = {slot["slotId"]: slot["status"] for slot in result["slots"]}
    assert statuses["slot-cancelled"] == "cancelled"
    assert statuses["slot-moved"] == "moved"
    assert [conflict for conflict in result["conflicts"] if "slot-cancelled" in conflict["slotIds"]] == []


def test_a_paused_formation_ignores_its_future_slots() -> None:
    result = plan_schedule(PLAN_INPUTS["pausedFormation"])
    assert not any(slot["slotId"] == "slot-x" for slot in result["slots"])


def test_a_manual_move_outside_a_study_day_is_reported_and_recomputed() -> None:
    result = plan_schedule(PLAN_INPUTS["manualOnSunday"])
    reported = [
        conflict
        for conflict in result["conflicts"]
        if conflict["date"] == "2026-11-15"
        and conflict["kind"] == "overlap"
        and conflict["slotIds"] == ["slot-sunday"]
    ]
    assert len(reported) == 1
    assert not any(slot["slotId"] == "slot-sunday" for slot in result["slots"])


def test_a_manual_move_overlapping_a_busy_slot_is_reported() -> None:
    result = plan_schedule(PLAN_INPUTS["manualOverlap"])
    assert any(slot["slotId"] == "slot-first" for slot in result["slots"])
    assert any(conflict["slotIds"] == ["slot-second"] for conflict in result["conflicts"])


def test_an_existing_global_quiz_is_not_duplicated() -> None:
    result = plan_schedule(PLAN_INPUTS["existingGlobalQuiz"])
    quizzes = [
        slot["slotId"]
        for slot in result["slots"]
        if slot["kind"] == "global_quiz" and local_date_of(slot["startsAt"], TZ) == "2026-11-16"
    ]
    assert quizzes == ["slot-quiz"]
    assert result == PLAN_RESULTS["existingGlobalQuiz"]


def test_an_existing_day_over_capacity_reports_overlap_and_capacity() -> None:
    result = plan_schedule(PLAN_INPUTS["existingOverCapacity"])
    conflicts = {(conflict["kind"], tuple(conflict["slotIds"])) for conflict in result["conflicts"]}
    assert ("overlap", ("slot-over-1", "slot-over-2")) in conflicts
    assert any(kind == "capacity" for kind, _ids in conflicts)


def test_a_slot_across_midnight_is_split_per_civil_day() -> None:
    intervals = slot_local_intervals("2026-11-16T22:30:00.000Z", "2026-11-17T00:30:00.000Z", TZ)
    assert [(date, (range_.start, range_.end)) for date, range_ in intervals] == [
        ("2026-11-16", (1410, 1440)),
        ("2026-11-17", (0, 90)),
    ]
    plan = plan_schedule(PLAN_INPUTS["slotAcrossMidnight"])
    dates = {entry["date"] for entry in plan["remainingCapacity"]}
    assert {"2026-11-16", "2026-11-17"} <= dates
