"""[SPEC-2202] Composition of the streak and its milestones (SPEC-409).

Daily activity, the engine clock and the `ENGINE` bounds of the configuration package composed end
to end.
"""

from typing import Any

import pytest
from learny.learning.domain.params import with_params
from learny.learning.domain.streak import (
    MilestoneParams,
    StreakParams,
    calculate_streak,
    detect_milestones,
)
from learny.learning.domain.time import instant_at, local_date_of

pytestmark = pytest.mark.spec("SPEC-2202")

PARIS = "Europe/Paris"
AT = "2026-11-11T12:20:00.000Z"


def streak_params(overrides: dict[str, Any] | None = None) -> StreakParams:
    """`ENGINE.streak` as the typed bounds of the engine."""
    values = with_params("streak", overrides)
    return StreakParams(
        reading_min_seconds=values["readingMinSeconds"],
        regularity_days=values["regularityDays"],
        max_lookback_days=values["maxLookbackDays"],
    )


def milestone_params() -> MilestoneParams:
    """`ENGINE.milestones` as the typed bounds of the engine."""
    values = with_params("milestones")
    return MilestoneParams(notions_retained=values["notionsRetained"], streak_days=values["streakDays"])


def entry(at: str, kind: str = "quiz", duration_seconds: int | None = None) -> dict[str, Any]:
    """One completed activity; a reading day only qualifies above the configured minutes."""
    return (
        {"at": at, "kind": kind}
        if duration_seconds is None
        else {
            "at": at,
            "kind": kind,
            "durationSeconds": duration_seconds,
        }
    )


def test_daily_activity_the_clock_and_the_engine_bounds_are_composed() -> None:
    params = streak_params()
    result = calculate_streak(
        [
            entry(instant_at("2026-11-06", "19:00", PARIS)),
            entry(instant_at("2026-11-09", "19:00", PARIS), "exercise"),
            entry(instant_at("2026-11-10", "19:00", PARIS), "reading", 300),
        ],
        [1, 2, 3, 4, 5],
        [],
        AT,
        PARIS,
        params,
    )

    # Friday, Monday and Tuesday are consecutive study days; the unplanned weekend is neutral.
    assert result.days == 3
    assert len(result.calendar) == params.regularity_days
    assert result.calendar[-1].date == local_date_of(AT, PARIS)
    assert result.last_qualifying_day == "2026-11-10"


def test_a_parameter_override_does_not_change_the_contract() -> None:
    params = streak_params({"readingMinSeconds": 600, "regularityDays": 7, "maxLookbackDays": 3})
    result = calculate_streak(
        [
            entry(instant_at("2026-11-09", "19:00", PARIS), "reading"),
            entry(instant_at("2026-11-10", "19:00", PARIS), "reading"),
        ],
        [1, 2, 3, 4, 5, 6, 7],
        [],
        AT,
        PARIS,
        params,
    )

    assert result.days == 0
    assert len(result.calendar) == 7
    assert result.last_qualifying_day is None


def test_repetition_is_invariant_and_milestones_are_not_doubled() -> None:
    params = streak_params()
    source = [
        entry(instant_at("2026-11-09", "19:00", PARIS)),
        entry(instant_at("2026-11-10", "19:00", PARIS)),
    ]
    first = calculate_streak(source, [1, 2, 3, 4, 5], [], AT, PARIS, params)
    second = calculate_streak(source, [1, 2, 3, 4, 5], [], AT, PARIS, params)
    bounds = milestone_params()
    detected = detect_milestones([], [], bounds.notions_retained, first.days, bounds)
    recalculated = detect_milestones(
        [milestone.key for milestone in detected],
        [],
        bounds.notions_retained,
        second.days,
        bounds,
    )

    assert first.to_dict() == second.to_dict()
    assert [milestone.kind for milestone in detected] == ["notions_100"]
    assert recalculated == []


def test_the_composition_holds_across_a_daylight_saving_change() -> None:
    params = streak_params()
    at = instant_at("2026-10-26", "13:00", PARIS)
    previous_evening = instant_at("2026-10-25", "23:30", PARIS)
    result = calculate_streak(
        [
            entry(instant_at("2026-10-24", "23:30", PARIS)),
            entry(previous_evening),
            entry(instant_at("2026-10-26", "00:30", PARIS)),
        ],
        [1, 2, 3, 4, 5, 6, 7],
        [],
        at,
        PARIS,
        params,
    )

    assert local_date_of(previous_evening, PARIS) == "2026-10-25"
    assert result.calendar[-1].date == "2026-10-26"
    assert result.last_qualifying_day == "2026-10-26"
    assert result.days == 3
