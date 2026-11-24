"""[SPEC-2202] Deterministic planner of the learning engine (SPEC-407, ADR-0029, ADR-0280).

The expected slots, conflicts, daily capacities, BR-FOR-14 options and deadlines are the reference
recordings, replayed here with a strict equality (no tolerance).
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.planner import find_compatible_slots, plan_schedule, replan_schedule
from learny.learning.domain.time import (
    add_days,
    days_between,
    instant_at,
    iso_weekday,
    local_date_of,
    local_minutes_of,
    parse_instant,
)

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "learning_engine_planner.json").read_text(
        encoding="utf-8"
    )
)
INPUTS = FIXTURE["inputs"]
OUTPUT = FIXTURE["output"]
PLANS = INPUTS["plans"]
PLAN_INPUTS = {entry["name"]: entry["input"] for entry in PLANS}
PLAN_RESULTS = {entry["name"]: entry["result"] for entry in OUTPUT["plans"]}

NOW = INPUTS["now"]
TZ = INPUTS["tz"]
PARAMS = INPUTS["params"]
AVAILABILITY = INPUTS["availability"]
FORMATIONS = PLAN_INPUTS["base"]["formations"]


def preferences(**overrides: Any) -> dict[str, Any]:
    """The learner preferences of the reference suite, with availability overrides."""
    return {
        "tz": TZ,
        "availability": {**AVAILABILITY, **overrides},
        "holidays": ["2026-11-11"],
    }


def plan_input(**overrides: Any) -> dict[str, Any]:
    """One planning input for the planner."""
    payload: dict[str, Any] = {
        "formations": FORMATIONS,
        "preferences": preferences(),
        "params": PARAMS,
        "now": NOW,
    }
    payload.update(overrides)
    return payload


def by_day(slots: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Planned slots grouped by local civil day."""
    days: dict[str, list[dict[str, Any]]] = {}
    for slot in slots:
        if slot["status"] != "planned":
            continue
        days.setdefault(local_date_of(slot["startsAt"], TZ), []).append(slot)
    return days


def minutes_of(slot: dict[str, Any]) -> int:
    """Real duration of one slot in minutes."""
    return (parse_instant(slot["endsAt"]) - parse_instant(slot["startsAt"])) // 60_000


@pytest.mark.parametrize("name", list(PLAN_INPUTS), ids=list(PLAN_INPUTS))
def test_every_recorded_plan_matches_the_typescript_engine(name: str) -> None:
    assert plan_schedule(PLAN_INPUTS[name]) == PLAN_RESULTS[name]


def test_replanning_matches_the_typescript_engine() -> None:
    assert replan_schedule(INPUTS["replan"]) == OUTPUT["replan"]["result"]


def test_replanning_is_a_plain_plan_of_the_same_input() -> None:
    payload = plan_input()
    assert replan_schedule({**payload, "reason": "rhythm_change"}) == plan_schedule(payload)


@pytest.mark.parametrize(
    "name",
    [entry["name"] for entry in INPUTS["compatible"]],
    ids=[entry["name"] for entry in INPUTS["compatible"]],
)
def test_every_recorded_compatible_search_matches_the_typescript_engine(name: str) -> None:
    entry = next(candidate for candidate in INPUTS["compatible"] if candidate["name"] == name)
    expected = next(candidate for candidate in OUTPUT["compatible"] if candidate["name"] == name)
    assert (
        find_compatible_slots(entry["activity"], entry["calendar"], entry["preferences"], entry["count"])
        == expected["result"]
    )


def test_two_formations_never_exceed_the_daily_capacity_nor_overlap() -> None:
    result = plan_schedule(plan_input())
    assert result["unscheduled"] == []
    capacity = AVAILABILITY["hoursPerDay"] * 60
    for day, slots in by_day(result["slots"]).items():
        assert sum(minutes_of(slot) for slot in slots) <= capacity, day
        ordered = sorted(slots, key=lambda slot: parse_instant(slot["startsAt"]))
        for index in range(1, len(ordered)):
            assert parse_instant(ordered[index]["startsAt"]) >= parse_instant(ordered[index - 1]["endsAt"]), (
                f"{day} {ordered[index]['slotId']}"
            )
    assert result["conflicts"] == []


def test_each_validation_quiz_is_followed_by_its_margin() -> None:
    result = plan_schedule(plan_input())
    quizzes = [slot for slot in result["slots"] if slot["kind"] == "validation_quiz"]
    assert len(quizzes) == 3
    for quiz in quizzes:
        margin = next(
            (
                slot
                for slot in result["slots"]
                if slot["kind"] == "buffer" and slot["startsAt"] == quiz["endsAt"]
            ),
            None,
        )
        assert margin is not None, quiz["title"]
        assert minutes_of(margin) == 60


def test_each_study_day_ends_with_a_thirty_minute_global_quiz() -> None:
    result = plan_schedule(plan_input())
    for day, slots in by_day(result["slots"]).items():
        globals_on_day = [slot for slot in slots if slot["kind"] == "global_quiz"]
        assert len(globals_on_day) == 1, day
        assert minutes_of(globals_on_day[0]) == 30
        latest = sorted(slots, key=lambda slot: parse_instant(slot["startsAt"]))
        assert latest[-1]["kind"] == "global_quiz"


def test_study_days_weekends_and_holidays_are_respected() -> None:
    result = plan_schedule(plan_input())
    for slot in result["slots"]:
        day = local_date_of(slot["startsAt"], TZ)
        assert day != "2026-11-11"
        assert 1 <= iso_weekday(day) <= 5


def test_an_availability_without_study_day_is_refused() -> None:
    with pytest.raises(EngineError) as refused:
        plan_schedule(
            plan_input(
                preferences={
                    "tz": TZ,
                    "availability": {**AVAILABILITY, "studyDays": []},
                }
            )
        )
    assert refused.value.code == "INVALID_AVAILABILITY"


def test_two_formations_ending_the_same_day_are_ordered_by_identifier() -> None:
    first = {**FORMATIONS[1], "endDate": "2026-11-25"}
    formations = [
        {**first, "formationId": "zeta"},
        {**first, "formationId": "alpha"},
    ]
    result = plan_schedule(plan_input(formations=formations))
    first_slot = next(
        (
            slot
            for slot in result["slots"]
            if slot["formationId"] is not None and slot["kind"] == "contributions"
        ),
        None,
    )
    assert first_slot is not None
    assert first_slot["formationId"] == "alpha"


def test_a_missed_session_keeps_its_history_and_creates_a_distinct_future_slot() -> None:
    base = plan_schedule(plan_input())
    planned = next(slot for slot in base["slots"] if slot["kind"] == "course")
    result = plan_schedule(PLAN_INPUTS["missedCourseReplayed"])
    history = next(slot for slot in result["slots"] if slot["slotId"] == "slot-missed-1")
    assert history["status"] == "missed"
    replay = [
        slot
        for slot in result["slots"]
        if slot["status"] == "planned"
        and slot["title"] == planned["title"]
        and slot["slotId"] != "slot-missed-1"
    ]
    assert replay
    assert replay[0]["slotId"] != planned["slotId"]


def test_a_paused_formation_receives_no_future_slot_but_keeps_its_completed_ones() -> None:
    result = plan_schedule(PLAN_INPUTS["pausedFormation"])
    assert any(slot["slotId"] == "slot-done-1" for slot in result["slots"])
    future = [
        slot
        for slot in result["slots"]
        if slot["formationId"] == "sap"
        and slot["status"] == "planned"
        and parse_instant(slot["startsAt"]) >= parse_instant(NOW)
    ]
    assert future == []


def test_a_valid_manual_move_is_preserved() -> None:
    result = plan_schedule(PLAN_INPUTS["manualMovePreserved"])
    assert any(slot["slotId"] == "slot-manual-1" for slot in result["slots"])
    assert [conflict for conflict in result["conflicts"] if conflict["slotIds"] == ["slot-manual-1"]] == []


def test_an_impossible_deadline_produces_three_numbered_options_without_applying_any() -> None:
    base = plan_schedule(PLAN_INPUTS["tightThreeHours"])
    assert base["deadlines"][0]["missed"] is True
    assert [option["kind"] for option in base["options"]] == [
        "shift_end",
        "increase_volume",
        "lighten",
    ]
    shift = base["options"][0]
    assert shift["feasible"] is True
    assert shift["extraDays"] > 0
    assert base["options"][2]["removedMinutes"] > 0
    again = plan_schedule(PLAN_INPUTS["tightThreeHours"])
    assert again["slots"] == base["slots"]


def test_at_six_hours_a_day_the_volume_option_is_still_infeasible() -> None:
    result = plan_schedule(PLAN_INPUTS["hugeThreeHours"])
    volume = next(option for option in result["options"] if option["kind"] == "increase_volume")
    assert volume["feasible"] is False
    assert "6 h" in volume["reason"]


def test_the_plan_is_deterministic_and_independent_of_the_formation_order() -> None:
    first = plan_schedule(plan_input())
    second = plan_schedule(plan_input())
    assert second == first
    reversed_plan = plan_schedule(PLAN_INPUTS["reversed"])
    assert reversed_plan["slots"] == first["slots"]


def test_two_mock_exams_and_sprints_are_placed() -> None:
    result = plan_schedule(plan_input())
    mocks = [slot for slot in result["slots"] if slot["kind"] == "mock_exam"]
    assert len(mocks) == 2
    assert all(minutes_of(slot) == 40 for slot in mocks)
    sprints = [slot for slot in result["slots"] if slot["kind"] == "sprint"]
    assert sprints
    for sprint in sprints:
        assert minutes_of(sprint) == 30
        assert sprint["startsAt"] < sprint["endsAt"]


def test_a_daylight_saving_change_produces_no_slot_in_a_missing_hour() -> None:
    result = plan_schedule(PLAN_INPUTS["dstSpringForward"])
    for slot in result["slots"]:
        start = local_minutes_of(slot["startsAt"], TZ)
        end = local_minutes_of(slot["endsAt"], TZ)
        assert start < end
        assert start < 120 or start >= 180
        assert minutes_of(slot) >= end - start


def test_parameters_outside_the_bounds_are_refused() -> None:
    with pytest.raises(EngineError):
        plan_schedule(plan_input(params={**PARAMS, "globalQuizMinutes": 0}))


def test_compatible_slots_returns_three_sorted_non_overlapping_windows() -> None:
    base = plan_schedule(plan_input())
    alternatives = find_compatible_slots(
        {"durationMinutes": 60, "kind": "course"},
        {"now": NOW, "params": PARAMS, "slots": base["slots"], "holidays": ["2026-11-11"]},
        preferences(),
    )
    assert len(alternatives) == 3
    times = [parse_instant(slot["startsAt"]) for slot in alternatives]
    assert sorted(times) == times
    for alternative in alternatives:
        assert parse_instant(alternative["endsAt"]) - parse_instant(alternative["startsAt"]) == 60 * 60_000
        for slot in base["slots"]:
            assert not (
                parse_instant(alternative["startsAt"]) < parse_instant(slot["endsAt"])
                and parse_instant(slot["startsAt"]) < parse_instant(alternative["endsAt"])
            )


def test_the_plan_is_empty_without_formation() -> None:
    result = plan_schedule(plan_input(formations=[]))
    assert result["slots"] == []
    assert result["options"] == []
    assert result["deadlines"] == []
    assert result["remainingCapacity"] == []
    assert result["unscheduled"] == []


def test_activities_are_placed_in_programme_order() -> None:
    result = plan_schedule(plan_input())
    ordered = sorted(
        (slot for slot in result["slots"] if slot["formationId"] == "sap" and slot["moduleId"] == "sap-m1"),
        key=lambda slot: parse_instant(slot["startsAt"]),
    )
    kinds = [slot["kind"] for slot in ordered]
    contribution = kinds.index("contributions")
    course = kinds.index("course")
    quiz = kinds.index("validation_quiz")
    assert contribution < course < quiz


def test_the_remaining_capacity_is_computed_per_day() -> None:
    result = plan_schedule(plan_input())
    assert result["remainingCapacity"]
    for capacity in result["remainingCapacity"]:
        assert capacity["usedMinutes"] <= capacity["totalMinutes"]
        assert capacity["remainingMinutes"] == capacity["totalMinutes"] - capacity["usedMinutes"]


def test_a_holiday_does_not_break_the_programme_order() -> None:
    result = plan_schedule(plan_input())
    assert [slot for slot in result["slots"] if local_date_of(slot["startsAt"], TZ) == "2026-11-11"] == []
    assert add_days("2026-11-11", 1) == "2026-11-12"
    assert days_between("2026-11-11", "2026-11-25") == 14
    assert instant_at("2026-11-12", "09:00", TZ) == "2026-11-12T08:00:00.000Z"
