"""[SPEC-603] Pure derivations of the home screen (port of `derive.test.ts`)."""

from typing import Any

import pytest
from learny.shared.locale_fr import home as texts
from learny.shared.time import parse_iso
from learny.views.home_derivations import (
    ActionSlot,
    DaySlot,
    ScheduledSlot,
    civil_day_label,
    completed_summary,
    deferred_day_label,
    format_duration,
    highlighted_slot,
    minutes_until,
    module_status_pill,
    next_activity,
    next_activity_detail,
    next_activity_label,
    objective_labels,
    primary_action_for,
    slot_href,
    slot_state,
)

pytestmark = pytest.mark.spec("SPEC-603")

NOW = parse_iso("2026-11-11T12:20:00.000Z")
TZ = "Europe/Paris"


def slot(**overrides: Any) -> DaySlot:
    values: dict[str, Any] = {
        "id": "slot-1",
        "kind": "validation_quiz",
        "status": "planned",
        "starts_at": "2026-11-11T13:00:00.000Z",
        "ends_at": "2026-11-11T14:00:00.000Z",
    }
    values.update(overrides)
    return DaySlot(**values)


def module_status(**overrides: Any) -> dict[str, str] | None:
    values: dict[str, Any] = {
        "contributions_in_progress": False,
        "course_status": "ready",
        "reading_percent": 100,
        "attempt_count": 2,
        "last_score": 90,
        "threshold": 80,
    }
    values.update(overrides)
    return module_status_pill(**values)


def pill(values: tuple[str, str]) -> dict[str, str]:
    return {"label": values[0], "tone": values[1]}


def test_the_state_of_a_slot_is_derived() -> None:
    assert slot_state(slot(status="done"), NOW) == "done"
    assert slot_state(slot(status="missed"), NOW) == "missed"
    assert (
        slot_state(slot(starts_at="2026-11-11T12:00:00.000Z", ends_at="2026-11-11T13:00:00.000Z"), NOW)
        == "ongoing"
    )
    assert slot_state(slot(), NOW, highlight_id="slot-1") == "next"
    assert slot_state(slot(id="other"), NOW, highlight_id="slot-1") == "upcoming"
    assert slot_state(slot(kind="warmup"), NOW) == "todo"
    assert slot_state(slot(kind="micro_session"), NOW) == "todo"
    assert slot_state(slot(kind="global_quiz"), NOW) == "upcoming"
    assert slot_state(slot(status="moved", starts_at="2026-11-11T15:00:00.000Z"), NOW) == "upcoming"
    assert slot_state(slot(status="cancelled", starts_at="2026-11-11T15:00:00.000Z"), NOW) == "upcoming"


def test_the_first_planned_slot_outside_warm_up_and_micro_session_is_highlighted() -> None:
    slots = [
        slot(id="done", status="done", starts_at="2026-11-11T08:00:00.000Z"),
        slot(id="warmup", kind="warmup", starts_at="2026-11-11T12:30:00.000Z"),
        slot(id="quiz", starts_at="2026-11-11T13:00:00.000Z"),
        slot(id="later", kind="course", starts_at="2026-11-11T15:00:00.000Z"),
    ]

    highlight = highlighted_slot(slots, NOW)

    assert highlight is not None
    assert highlight.id == "quiz"
    assert minutes_until("2026-11-11T13:00:00.000Z", NOW) == 40
    assert minutes_until("2026-11-10T13:00:00.000Z", NOW) == 0
    assert highlighted_slot([slot(id="done-only", status="done")], NOW) is None


def test_durations_are_formatted_in_hours_and_minutes() -> None:
    assert format_duration(45) == "45 min"
    assert format_duration(60) == "1 h"
    assert format_duration(90) == "1 h 30"
    assert format_duration(300) == "5 h"
    assert format_duration(0) == "0 min"
    assert format_duration(-5) == "0 min"


def test_objectives_are_translated_in_the_order_of_the_formation() -> None:
    assert objective_labels(["operational", "exam"]) == [
        texts.OBJECTIVE_LABELS["operational"],
        texts.OBJECTIVE_LABELS["exam"],
    ]
    assert objective_labels(["dialogue", "project"]) == [
        "Dialoguer avec des experts",
        "Livrer un projet",
    ]
    assert objective_labels([]) == []


def test_the_pill_of_the_open_module_follows_the_ef_6_order() -> None:
    assert module_status(last_score=58) == pill(texts.MODULE_STATUS_TO_RETAKE)
    assert module_status(attempt_count=0, last_score=None) == pill(texts.MODULE_STATUS_TO_TAKE)
    assert module_status(reading_percent=35) == pill(texts.MODULE_STATUS_READING)
    assert module_status(reading_percent=None, course_status="generating") == pill(
        texts.MODULE_STATUS_PREPARING
    )
    assert module_status(reading_percent=None, course_status=None, contributions_in_progress=True) == pill(
        texts.MODULE_STATUS_CONTRIBUTIONS
    )
    assert module_status(reading_percent=None, course_status=None) is None

    # A contribution still in progress blocks the quiz steps: the course does not exist yet.
    assert module_status(
        reading_percent=None,
        course_status="generating",
        contributions_in_progress=True,
        attempt_count=0,
        last_score=None,
    ) == pill(texts.MODULE_STATUS_PREPARING)
    assert module_status(
        reading_percent=None,
        course_status=None,
        contributions_in_progress=True,
        attempt_count=0,
        last_score=None,
    ) == pill(texts.MODULE_STATUS_CONTRIBUTIONS)


def test_the_next_activity_is_relative_or_dated() -> None:
    assert next_activity_label("2026-11-11T13:00:00.000Z", NOW, TZ) == "Aujourd'hui, 14:00"
    assert next_activity_label("2026-11-12T16:30:00.000Z", NOW, TZ) == "Demain, 17:30"
    dated = next_activity_label("2026-11-13T08:00:00.000Z", NOW, TZ)
    assert "13 nov." in dated
    assert "09:00" in dated
    assert next_activity(
        ScheduledSlot(
            kind="contributions",
            starts_at="2026-11-12T16:30:00.000Z",
            meta="Retrospectives, chapitre 2",
        ),
        NOW,
        TZ,
    ) == {"when": "Demain, 17:30", "detail": "Apports, chapitre 2"}
    assert next_activity_detail("contributions", "sans chapitre") == "Apports"
    assert next_activity_detail("validation_quiz", None) == "Quiz de validation"
    assert next_activity(None, NOW, TZ) is None


def test_the_day_label_and_the_deferred_days_are_formatted() -> None:
    assert civil_day_label("2026-11-11", TZ) == "Mercredi 11 novembre"
    assert deferred_day_label("2026-11-12", "2026-11-11", TZ) == "jeudi"
    assert "19 nov." in deferred_day_label("2026-11-19", "2026-11-11", TZ)


def test_a_completed_formation_is_summarised() -> None:
    assert completed_summary(
        start_date="2026-08-24",
        completed_at="2026-09-18T16:00:00.000Z",
        volume_hours=60,
        time_zone=TZ,
    ) == {"completedOn": "2026-09-18", "dateLabel": "18 sept. 2026", "weeks": 4, "hours": 60}
    assert completed_summary(
        start_date=None,
        completed_at="2026-07-02T16:00:00.000Z",
        volume_hours=80,
        time_zone=TZ,
    ) == {"completedOn": "2026-07-02", "dateLabel": "2 juil. 2026", "weeks": None, "hours": 80}
    assert completed_summary(start_date="2026-08-24", completed_at=None, volume_hours=None, time_zone=TZ) == {
        "completedOn": None,
        "dateLabel": None,
        "weeks": None,
        "hours": None,
    }


def test_the_main_action_and_the_link_of_a_slot_are_built() -> None:
    base = {"formation_id": "f1", "module_id": "m1", "activity_id": "a1"}
    quiz = primary_action_for(ActionSlot(**base, kind="validation_quiz"))
    assert quiz is not None
    assert quiz["href"] == "/formations/f1/modules/m1/quiz"
    course = primary_action_for(ActionSlot(**base, kind="course"))
    assert course is not None
    assert course["label"] == "Reprendre le cours"
    contributions = primary_action_for(ActionSlot(**base, kind="contributions"))
    assert contributions is not None
    assert contributions["href"] == "/formations/f1/modules/m1"
    exercise = primary_action_for(ActionSlot(**base, kind="exercise"))
    assert exercise is not None
    assert exercise["href"] == "/formations/f1/modules/m1/exercices/a1"
    bare_exercise = primary_action_for(
        ActionSlot(formation_id="f1", module_id=None, activity_id=None, kind="exercise")
    )
    assert bare_exercise is not None
    assert bare_exercise["href"] == "/formations/f1/programme/exercices"
    global_quiz = primary_action_for(
        ActionSlot(formation_id="f1", module_id=None, activity_id=None, kind="global_quiz")
    )
    assert global_quiz is not None
    assert global_quiz["href"] == "/formations/f1/quiz-global"
    revision = primary_action_for(
        ActionSlot(formation_id="f1", module_id=None, activity_id=None, kind="revision")
    )
    assert revision is not None
    assert revision["label"] == texts.PRIMARY_REVIEW_NOW
    sprint = primary_action_for(
        ActionSlot(formation_id="f1", module_id=None, activity_id=None, kind="sprint")
    )
    assert sprint is not None
    assert sprint["label"] == texts.PRIMARY_REVIEW_NOW
    mock_exam = primary_action_for(
        ActionSlot(formation_id="f1", module_id=None, activity_id=None, kind="mock_exam")
    )
    assert mock_exam is not None
    assert mock_exam["href"] == "/formations/f1/examen-blanc"
    assert (
        primary_action_for(ActionSlot(formation_id="f1", module_id=None, activity_id=None, kind="buffer"))
        is None
    )
    assert (
        primary_action_for(
            ActionSlot(formation_id="f1", module_id=None, activity_id=None, kind="weekly_review")
        )
        is None
    )
    assert primary_action_for(None) is None
    assert slot_href(ActionSlot(**base, kind="warmup")) == texts.SLOT_ANCHOR_WARMUP
    assert slot_href(ActionSlot(**base, kind="micro_session")) == "/formations/f1/quiz-global?mode=micro"
    assert (
        slot_href(ActionSlot(formation_id="f1", module_id=None, activity_id=None, kind="global_quiz"))
        == "/formations/f1/quiz-global"
    )
    assert (
        slot_href(ActionSlot(formation_id="f1", module_id=None, activity_id=None, kind="buffer"))
        == "/formations/f1/programme"
    )
