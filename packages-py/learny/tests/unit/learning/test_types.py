"""[SPEC-2202] Public contracts of the pure engine (SPEC-401 ET-2, CL-6, CL-9)."""

import json

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.types import (
    AnswerRecord,
    Availability,
    DateRange,
    GapState,
    NotionRef,
    assert_availability,
    assert_local_time,
    assert_time_zone,
    validate_card,
)

pytestmark = pytest.mark.spec("SPEC-2202")

SAP_AVAILABILITY = {
    "hoursPerDay": 4,
    "studyDays": [1, 2, 3, 4, 5],
    "preferredSlots": ["matin", "apres_midi"],
}

CARD = {
    "due": "2026-11-11T12:20:00.000Z",
    "stability": 1,
    "difficulty": 5,
    "elapsed_days": 0,
    "scheduled_days": 1,
    "learning_steps": 0,
    "reps": 1,
    "lapses": 0,
    "state": "review",
    "last_review": None,
}


def _availability_error(value: object) -> EngineError:
    with pytest.raises(EngineError) as refused:
        assert_availability(value)
    assert refused.value.code == "INVALID_AVAILABILITY"
    return refused.value


def test_a_valid_availability_is_accepted_and_round_trips() -> None:
    availability = assert_availability(SAP_AVAILABILITY)
    assert availability == Availability(
        hours_per_day=4,
        study_days=(1, 2, 3, 4, 5),
        preferred_slots=("matin", "apres_midi"),
    )
    assert availability.to_dict() == SAP_AVAILABILITY


@pytest.mark.parametrize(
    ("value", "path"),
    [
        ({"hoursPerDay": 5, "studyDays": [], "preferredSlots": ["matin"]}, "studyDays"),
        ({"hoursPerDay": 7, "studyDays": [1, 2], "preferredSlots": ["matin"]}, "hoursPerDay"),
        (
            {"hoursPerDay": 5, "studyDays": [1, 2], "preferredSlots": ["matin", "matin"]},
            "preferredSlots",
        ),
        ({"hoursPerDay": 5, "studyDays": [2, 1], "preferredSlots": ["matin"]}, "studyDays"),
        (
            {"hoursPerDay": 5, "studyDays": [1, 2], "preferredSlots": ["soir", "matin"]},
            "preferredSlots",
        ),
        ({"hoursPerDay": 1.5, "studyDays": [1], "preferredSlots": ["matin"]}, "hoursPerDay"),
        ({"hoursPerDay": 0, "studyDays": [1], "preferredSlots": ["matin"]}, "hoursPerDay"),
    ],
)
def test_an_invalid_availability_is_refused_with_its_path(value: object, path: str) -> None:
    assert _availability_error(value).path == path


def test_an_availability_never_carries_an_unknown_field() -> None:
    refused = _availability_error({**SAP_AVAILABILITY, "extra": True})
    assert refused.path == "extra"


def test_a_card_round_trips_through_json() -> None:
    card = validate_card(json.loads(json.dumps(CARD)))
    assert card.to_dict() == CARD


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("stability", -1),
        ("difficulty", -1),
        ("stability", float("nan")),
        ("stability", float("inf")),
        ("state", "unknown"),
        ("due", "2026-02-30T00:00:00.000Z"),
        ("reps", -1),
        ("elapsed_days", 1.5),
    ],
)
def test_an_invalid_card_is_refused_on_its_field(field: str, value: object) -> None:
    with pytest.raises(EngineError) as refused:
        validate_card({**CARD, field: value})
    assert refused.value.code == "INVALID_INPUT"
    assert refused.value.path == field


def test_a_card_refuses_a_missing_and_an_unknown_field() -> None:
    missing = {key: value for key, value in CARD.items() if key != "reps"}
    with pytest.raises(EngineError) as refused:
        validate_card(missing)
    assert refused.value.path == "reps"
    with pytest.raises(EngineError) as refused_extra:
        validate_card({**CARD, "extra": True})
    assert refused_extra.value.path == "extra"


def test_a_negative_zero_is_refused() -> None:
    with pytest.raises(EngineError) as refused:
        validate_card({**CARD, "stability": -0.0})
    assert refused.value.path == "stability"


def test_a_date_range_is_ordered() -> None:
    assert DateRange.read({"startsOn": "2026-11-11", "endsOn": "2026-11-12"}).to_dict() == {
        "startsOn": "2026-11-11",
        "endsOn": "2026-11-12",
    }
    with pytest.raises(EngineError) as refused:
        DateRange.read({"startsOn": "2026-11-22", "endsOn": "2026-11-11"})
    assert refused.value.path == "endsOn"
    with pytest.raises(EngineError) as refused_day:
        DateRange.read({"startsOn": "2026-02-30", "endsOn": "2026-03-01"})
    assert refused_day.value.path == "startsOn"


def test_a_notion_ref_round_trips() -> None:
    reference = NotionRef(
        notion_id="n-s4",
        module_id="sap-m1",
        chapter_id="sap-m1-c1",
        module_position=1,
        position=0,
        label="SAP S/4HANA",
    )
    assert reference.to_dict() == {
        "notionId": "n-s4",
        "moduleId": "sap-m1",
        "chapterId": "sap-m1-c1",
        "modulePosition": 1,
        "position": 0,
        "label": "SAP S/4HANA",
    }
    assert json.loads(json.dumps(reference.to_dict())) == reference.to_dict()


def test_an_answer_record_and_a_gap_state_round_trip() -> None:
    answer = AnswerRecord(
        answer_id="a1",
        attempt_id="t1",
        attempt_kind="validation_quiz",
        attempt_no=1,
        source="validation",
        notion_ids=("n1",),
        format="choice_question",
        correct=True,
        score=1.0,
        max_score=1.0,
        self_rating=None,
        time_ms=12_000,
        answered_at="2026-11-11T12:20:00.000Z",
        chosen_distractor_notion_id=None,
        confused_with_notion_id=None,
        normalized_response="a",
        off_topic=False,
        counts_for_gaps=True,
    )
    assert json.loads(json.dumps(answer.to_dict())) == answer.to_dict()
    gap = GapState(
        nature="forgetting",
        confused_with=None,
        detected_at="2026-11-11T12:20:00.000Z",
        evidence="Notion oubliee.",
        cleared_at=None,
    )
    assert json.loads(json.dumps(gap.to_dict())) == gap.to_dict()
    assert gap.to_dict()["clearedAt"] is None


def test_a_local_time_and_a_time_zone_are_validated() -> None:
    assert assert_local_time("09:00") == "09:00"
    assert assert_time_zone("Europe/Paris") == "Europe/Paris"
    with pytest.raises(EngineError) as refused:
        assert_local_time("25:00")
    assert refused.value.code == "INVALID_INPUT"
    with pytest.raises(EngineError) as refused_zone:
        assert_time_zone("Mars/Olympus")
    assert refused_zone.value.code == "INVALID_INPUT"
