"""[SPEC-719] Rules and calculations of the sprints before a milestone (BR-AUT-08, ADR-0190).

The helpers are pure (ADR-0020): no database and no process clock. They pin the local J-K/J-1
calendar days across a daylight-saving change, the stable weakest-notion order, the planner
placement and the explicit impossible days of CL-3.
"""

from datetime import UTC, datetime
from typing import Any

import pytest
from learny.engagement.domain.automations import ActionView
from learny.engagement.domain.automations.definitions.sprint import (
    explain,
    place_sprint_targets,
    select_weakest_notions,
    sprint_dedupe_key,
    sprint_target_days,
)
from learny.learning.domain.planner import PlannerPreferences
from learny.learning.domain.types import Availability
from learny.shared.locale_fr import engagement_automations as fr

pytestmark = pytest.mark.spec("SPEC-719")

NOW = datetime(2026, 11, 11, 12, 20, tzinfo=UTC)
TZ = "Europe/Paris"

PREFERENCES = PlannerPreferences(
    tz=TZ,
    availability=Availability(
        hours_per_day=2,
        study_days=(1, 2, 3, 4, 5),
        preferred_slots=("soir",),
    ),
)


def uuid(index: int) -> str:
    """The stable identifier of the reference suite helper."""
    return f"00000000-0000-4000-8000-{index:012d}"


def test_an_exam_on_14_november_produces_j_minus_k_and_j_minus_one_as_local_days() -> None:
    """CA-1, ET-5 - the civil day stays stable across the daylight-saving change of 25 October."""
    assert sprint_target_days("2026-11-14", 3) == [
        {"label": "J-K", "day": "2026-11-11"},
        {"label": "J-1", "day": "2026-11-13"},
    ]
    assert sprint_target_days("2026-10-27", 3) == [
        {"label": "J-K", "day": "2026-10-24"},
        {"label": "J-1", "day": "2026-10-26"},
    ]
    assert sprint_target_days("2026-11-14", 2) == [
        {"label": "J-K", "day": "2026-11-12"},
        {"label": "J-1", "day": "2026-11-13"},
    ]
    assert sprint_target_days("2026-11-14", 5) == [
        {"label": "J-K", "day": "2026-11-09"},
        {"label": "J-1", "day": "2026-11-13"},
    ]


def test_two_thirty_minute_slots_are_placed_without_overlap() -> None:
    """CA-1, EF-2 - two 30-minute sprints, one per target day, never overlapping."""
    plan = place_sprint_targets(
        exam_date="2026-11-14",
        exam_slot_id=uuid(700),
        formation_id=uuid(1),
        module_id=uuid(10),
        days_before=3,
        duration_min=30,
        now=NOW,
        time_zone=TZ,
        preferences=PREFERENCES,
        slots=[],
    )

    assert [target["day"] for target in plan.targets] == ["2026-11-11", "2026-11-13"]
    assert all(target["durationMin"] == 30 for target in plan.targets)
    assert all(target["startsAt"] < target["endsAt"] for target in plan.targets)
    first, second = plan.targets
    assert first["startsAt"] != second["startsAt"]
    assert first["startsAt"] >= "2026-11-11T12:20:00.000Z"
    assert plan.impossible == []


def test_a_non_study_day_is_explained_and_the_compatible_slot_stays_placed() -> None:
    """CL-3 - 16 November 2026 is a Monday: J-K is Friday 13, J-1 is Sunday 15, not studied."""
    plan = place_sprint_targets(
        exam_date="2026-11-16",
        exam_slot_id=uuid(701),
        formation_id=uuid(1),
        module_id=uuid(10),
        days_before=3,
        duration_min=30,
        now=NOW,
        time_zone=TZ,
        preferences=PREFERENCES,
        slots=[],
    )

    assert [target["day"] for target in plan.targets] == ["2026-11-13"]
    assert plan.impossible == [{"label": "J-1", "day": "2026-11-15", "reason": "no_study_day"}]


def test_no_room_left_explains_both_days_without_overlap() -> None:
    """CL-3 - a busy agenda from the 11th to the 14th leaves no slot for either target day."""
    busy = {
        "slotId": uuid(900),
        "formationId": uuid(1),
        "moduleId": None,
        "kind": "course",
        "title": "Cours",
        "startsAt": "2026-11-11T08:00:00.000Z",
        "endsAt": "2026-11-14T23:00:00.000Z",
        "status": "planned",
        "createdBy": "planner",
        "movedFromId": None,
    }
    plan = place_sprint_targets(
        exam_date="2026-11-14",
        exam_slot_id=uuid(702),
        formation_id=uuid(1),
        module_id=uuid(10),
        days_before=3,
        duration_min=30,
        now=NOW,
        time_zone=TZ,
        preferences=PREFERENCES,
        slots=[busy],
    )

    assert plan.targets == []
    assert [entry["reason"] for entry in plan.impossible] == ["no_slot", "no_slot"]


def test_the_weakest_notions_come_first_with_a_stable_identifier_on_ties() -> None:
    """ET-3 - mastery ascending, then the notion identifier, and no empty row."""
    rows: list[dict[str, Any]] = [
        {"notionId": uuid(3), "label": "C", "mastery": 40},
        {"notionId": uuid(1), "label": "A", "mastery": 20},
        {"notionId": uuid(2), "label": "B", "mastery": 40},
        {"notionId": uuid(4), "label": "D", "mastery": 10},
    ]

    assert [notion["notionId"] for notion in select_weakest_notions(rows, 3)] == [
        uuid(4),
        uuid(1),
        uuid(2),
    ]
    assert select_weakest_notions([], 3) == []
    assert select_weakest_notions([{"notionId": "", "label": "", "mastery": 0}]) == []


def test_the_dedupe_key_depends_on_the_exam_the_date_and_k() -> None:
    """ET-4 - one action per milestone slot, exam local date and admitted K."""
    assert sprint_dedupe_key(uuid(700), "2026-11-14", 3) == f"sprint:{uuid(700)}:2026-11-14:3"
    assert sprint_dedupe_key(uuid(700), "2026-11-14", 3) != sprint_dedupe_key(uuid(700), "2026-11-15", 3)
    assert sprint_dedupe_key(uuid(700), "2026-11-14", 3) != sprint_dedupe_key(uuid(700), "2026-11-14", 5)


def test_the_explanation_fits_on_one_line_of_160_characters() -> None:
    """EF-2, section 10 - one French line, clipped, never a newline."""
    text = explain(
        ActionView(
            id=uuid(1),
            automation="sprint",
            kind="sprint_planned",
            summary="",
            formation_id=uuid(1),
            payload={
                "examTitle": "Quiz de validation Partie 3",
                "durationMin": 30,
                "notionIds": [uuid(1)],
                "notionLabels": [
                    "Cle de comptabilisation",
                    "Date comptable",
                    "Plan comptable",
                ],
                "targets": [
                    {
                        "label": "J-K",
                        "day": "2026-11-11",
                        "slotId": None,
                        "startsAt": "2026-11-11T17:30:00.000Z",
                        "endsAt": "2026-11-11T18:00:00.000Z",
                        "durationMin": 30,
                    },
                    {
                        "label": "J-1",
                        "day": "2026-11-13",
                        "slotId": None,
                        "startsAt": "2026-11-13T17:30:00.000Z",
                        "endsAt": "2026-11-13T18:00:00.000Z",
                        "durationMin": 30,
                    },
                ],
                "impossible": [],
            },
            undo_payload=None,
            requires_consent=False,
            status="applied",
            decided_at=None,
            created_at="2026-11-10T19:00:00.000Z",
        ),
        "vous",
        TZ,
    )

    assert len(text) <= 160
    assert text.startswith(fr.SPRINT_SENTENCE_VOUS.split("{duration}")[0] + "30 min")
    assert "\n" not in text
