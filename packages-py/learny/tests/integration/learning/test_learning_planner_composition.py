"""[SPEC-2202] Composition of the planner (SPEC-407, CA-1, CA-3, CA-4).

Ported from `packages/learning-engine/test/integration/planner.test.ts`: the planning, the
incremental replanning, the time helpers and the `ENGINE.planner` bounds composed end to end.
"""

from typing import Any

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.params import ENGINE, with_params
from learny.learning.domain.planner import plan_schedule, replan_schedule
from learny.learning.domain.time import local_date_of, parse_instant

pytestmark = pytest.mark.spec("SPEC-2202")

TZ = "Europe/Paris"

FORMATIONS: list[dict[str, Any]] = [
    {
        "formationId": "sap",
        "title": "SAP",
        "endDate": "2026-11-25",
        "objectives": ["exam"],
        "modules": [
            {
                "moduleId": "sap-m1",
                "position": 1,
                "title": "Module 1",
                "hours": 8,
                "hasExercise": True,
                "deadline": "2026-11-18",
                "chapters": [
                    {"chapterId": "sap-m1-c1", "position": 1},
                    {"chapterId": "sap-m1-c2", "position": 2},
                ],
            },
            {
                "moduleId": "sap-m2",
                "position": 2,
                "title": "Module 2",
                "hours": 5,
                "chapters": [{"chapterId": "sap-m2-c1", "position": 1}],
            },
        ],
    },
]


def planning_input(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "now": "2026-11-11T12:20:00.000Z",
        "params": with_params("planner"),
        "preferences": {
            "tz": TZ,
            "availability": {
                "hoursPerDay": 4,
                "studyDays": [1, 2, 3, 4, 5],
                "preferredSlots": ["matin", "apres_midi"],
            },
            "holidays": ["2026-11-11"],
        },
        "formations": FORMATIONS,
    }
    payload.update(overrides)
    return payload


def test_replanning_is_identical_when_no_event_changes_the_plan() -> None:
    first = plan_schedule(planning_input())
    second = replan_schedule(planning_input(reason="manual"))
    assert second["slots"] == first["slots"]
    assert second["remainingCapacity"] == first["remainingCapacity"]
    assert second["options"] == first["options"]


def test_completed_and_manual_slots_are_kept_and_a_missed_session_is_replayed() -> None:
    base = plan_schedule(planning_input())
    course = next(slot for slot in base["slots"] if slot["kind"] == "course")
    quiz = next(slot for slot in base["slots"] if slot["kind"] == "validation_quiz")
    done = {
        "slotId": "existing-done",
        "formationId": course["formationId"],
        "moduleId": course["moduleId"],
        "kind": course["kind"],
        "title": course["title"],
        "startsAt": course["startsAt"],
        "endsAt": course["endsAt"],
        "status": "done",
        "createdBy": "planner",
    }
    missed = {
        "slotId": "existing-missed",
        "formationId": quiz["formationId"],
        "moduleId": quiz["moduleId"],
        "kind": quiz["kind"],
        "title": quiz["title"],
        "startsAt": quiz["startsAt"],
        "endsAt": quiz["endsAt"],
        "status": "missed",
        "createdBy": "planner",
    }
    manual = {
        "slotId": "existing-manual",
        "formationId": "sap",
        "moduleId": "sap-m2",
        "kind": "course",
        "title": "Cours \u2014 Module 2",
        "startsAt": "2026-11-24T08:00:00.000Z",
        "endsAt": "2026-11-24T09:30:00.000Z",
        "status": "planned",
        "createdBy": "learner",
    }
    result = replan_schedule(
        planning_input(
            existingSlots=[done, missed, manual],
            now="2026-11-16T12:20:00.000Z",
            reason="session_missed",
        )
    )
    by_id = {slot["slotId"]: slot for slot in result["slots"]}
    assert by_id["existing-done"]["status"] == "done"
    assert by_id["existing-missed"]["status"] == "missed"
    assert by_id["existing-manual"]["status"] == "planned"
    replay = next(
        slot
        for slot in result["slots"]
        if slot["status"] == "planned"
        and slot["kind"] == "validation_quiz"
        and slot["title"] == quiz["title"]
        and slot["slotId"] != "existing-missed"
    )
    assert replay["slotId"] != quiz["slotId"]


def test_the_cumulative_capacity_is_respected_with_the_shipped_time_helpers() -> None:
    result = plan_schedule(planning_input())
    per_day: dict[str, float] = {}
    for slot in result["slots"]:
        if slot["status"] != "planned":
            continue
        date = local_date_of(slot["startsAt"], TZ)
        minutes = (parse_instant(slot["endsAt"]) - parse_instant(slot["startsAt"])) / 60_000
        per_day[date] = per_day.get(date, 0) + minutes
    for date, minutes in per_day.items():
        assert minutes <= 4 * 60, date
    assert "2026-11-11" not in per_day


def test_computing_the_options_never_changes_the_input() -> None:
    tight = {**FORMATIONS[0], "endDate": "2026-11-13"}
    source = planning_input(
        formations=[tight],
        preferences={
            **planning_input()["preferences"],
            "availability": {**planning_input()["preferences"]["availability"], "hoursPerDay": 2},
        },
    )
    snapshot = repr(source)
    result = plan_schedule(source)
    assert repr(source) == snapshot
    assert result["deadlines"][0]["missed"] is True
    assert len(result["options"]) >= 3
    for option in result["options"]:
        assert option["feasible"] or option.get("reason") is not None


def test_the_time_zone_and_the_parameters_compose_across_a_daylight_saving_change() -> None:
    dst = {
        "formationId": "dst",
        "title": "DST",
        "endDate": "2027-03-28",
        "modules": [
            {
                "moduleId": "dst-m1",
                "position": 1,
                "title": "DST",
                "hours": 4,
                "chapters": [{"chapterId": "dst-c1", "position": 1}],
            }
        ],
    }
    result = plan_schedule(
        {
            "now": "2027-03-27T12:20:00.000Z",
            "params": with_params("planner"),
            "preferences": {
                "tz": TZ,
                "availability": {"hoursPerDay": 6, "studyDays": [7], "preferredSlots": ["matin"]},
            },
            "formations": [dst],
        }
    )
    for slot in result["slots"]:
        real = (parse_instant(slot["endsAt"]) - parse_instant(slot["startsAt"])) / 60_000
        assert real > 0
        assert "T02:" not in slot["startsAt"]


def test_the_product_bounds_stay_the_engine_planner_ones() -> None:
    assert with_params("planner")["globalQuizMinutes"] == ENGINE["planner"]["globalQuizMinutes"]
    assert with_params("planner")["bufferMinutes"] == 60
    with pytest.raises(EngineError):
        with_params("planner", {"sprintDaysBeforeDefault": 4})
