"""[SPEC-2202] Test factories of the learning engine (SPEC-401 ET-8).

Ported from `packages/learning-engine/src/fixtures/builders.test.ts`. The `fast-check`
properties become explicit cases, as specified by `evidence/SPEC-2202/test-port-map.md`: the
recorded defaults must stay valid against the domain types, and the date helper must stay
independent from the system clock.
"""

import pytest
from factories.learning_support import (
    REFERENCE_NOW,
    at_days_before,
    build_answer,
    build_card,
    build_gap,
    build_notion_state,
    build_review_event,
)
from learny.learning.domain.time import add_days, is_iso_date, local_date_of
from learny.learning.domain.types import assert_availability, validate_card

pytestmark = pytest.mark.spec("SPEC-2202")


def test_the_builders_provide_documented_and_valid_defaults() -> None:
    assert build_card() == {
        "due": REFERENCE_NOW,
        "stability": 0,
        "difficulty": 0,
        "elapsed_days": 0,
        "scheduled_days": 0,
        "learning_steps": 0,
        "reps": 0,
        "lapses": 0,
        "state": "new",
        "last_review": None,
    }
    assert build_notion_state()["userId"] == "u-demo"
    assert build_notion_state()["notionId"] == "n-s4"
    assert build_notion_state()["mastery"] == 0
    assert build_notion_state()["gap"] is None
    assert build_answer()["attemptKind"] == "validation_quiz"
    assert build_answer()["source"] == "validation"
    assert build_answer()["notionIds"] == ["n-s4"]
    assert build_answer()["timeMs"] == 20_000
    assert build_answer()["correct"] is True
    assert build_gap()["nature"] == "confusion"
    assert build_gap()["confusedWith"] == "n-type"
    assert build_review_event()["rating"] == "good"
    assert build_review_event()["applied"] is True

    card = validate_card(build_card())
    assert card.to_dict() == build_card()
    availability = assert_availability(
        {"hoursPerDay": 5, "studyDays": [1, 2, 3, 4, 5], "preferredSlots": ["matin", "apres_midi"]}
    )
    assert availability.hours_per_day == 5
    assert availability.preferred_slots == ("matin", "apres_midi")


def test_the_date_helper_computes_a_j_minus_n_at_nine_utc_by_default() -> None:
    assert at_days_before(REFERENCE_NOW, 1) == "2026-11-10T09:00:00.000Z"
    assert at_days_before(REFERENCE_NOW, 0, "18:30") == "2026-11-11T18:30:00.000Z"
    assert at_days_before(REFERENCE_NOW, 32) == "2026-10-10T09:00:00.000Z"


@pytest.mark.parametrize(
    "availability",
    [
        {"hoursPerDay": 1, "studyDays": [1], "preferredSlots": ["matin"]},
        {"hoursPerDay": 6, "studyDays": [1, 2, 3, 4, 5, 6, 7], "preferredSlots": ["soir"]},
        {
            "hoursPerDay": 3,
            "studyDays": [2, 4],
            "preferredSlots": ["matin", "apres_midi", "soir"],
        },
    ],
    ids=["one-hour", "all-days", "three-slots"],
)
def test_generated_availabilities_are_valid(availability: dict[str, object]) -> None:
    parsed = assert_availability(availability)
    assert 1 <= parsed.hours_per_day <= 6
    assert list(parsed.study_days) == sorted(parsed.study_days)


@pytest.mark.parametrize("offset", [0, 1, 31, 365])
def test_generated_civil_days_stay_inside_the_year(offset: int) -> None:
    day = add_days("2026-01-01", offset)
    assert is_iso_date(day)
    assert day.startswith(("2026-", "2027-"))
    assert local_date_of(f"{day}T00:00:00.000Z", "UTC") == day
