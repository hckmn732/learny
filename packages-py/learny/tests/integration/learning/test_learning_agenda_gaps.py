"""[SPEC-2202] Agenda and gaps read-model helpers (SPEC-704, SPEC-615).

The pure parts of `packages/services/src/agenda/get-agenda.ts` and `gaps/{links,list-gaps}.ts`:
slot targets, period totals, training and course links, and the two `AgendaQuery` refinements of
`packages/contracts/src/agenda.ts`.
"""

from typing import Any

import pytest
from learny.learning.application.agenda import agenda_totals, slot_href, slot_label
from learny.learning.application.gaps import course_target, training_target
from learny.shared.errors import AppError
from learny.shared.locale_fr import learning as texts
from learny_api.validate import apply_refinement

pytestmark = pytest.mark.spec("SPEC-2202")

FORMATION = "11111111-1111-4111-8111-111111111111"
MODULE = "22222222-2222-4222-8222-222222222222"
NOTION = "n-cle"
CHAPTER = "33333333-3333-4333-8333-333333333333"
SECTION = "44444444-4444-4444-8444-444444444444"
DATE = "2026-11-11"


@pytest.mark.parametrize(
    ("kind", "module_id", "activity_id", "expected"),
    [
        ("contributions", MODULE, None, f"/formations/{FORMATION}/modules/{MODULE}"),
        ("course", None, None, f"/formations/{FORMATION}"),
        ("course", MODULE, None, f"/formations/{FORMATION}/modules/{MODULE}/cours"),
        ("exercise", None, None, f"/formations/{FORMATION}/programme"),
        ("exercise", MODULE, None, f"/formations/{FORMATION}/modules/{MODULE}"),
        (
            "exercise",
            MODULE,
            "55555555-5555-4555-8555-555555555555",
            f"/formations/{FORMATION}/modules/{MODULE}/exercices/55555555-5555-4555-8555-555555555555",
        ),
        ("validation_quiz", MODULE, None, f"/formations/{FORMATION}/modules/{MODULE}/quiz"),
        ("mock_exam", None, None, f"/formations/{FORMATION}/examen-blanc"),
        ("global_quiz", MODULE, None, f"/formations/{FORMATION}/quiz-global"),
        ("revision", None, None, f"/formations/{FORMATION}/quiz-global"),
        ("sprint", None, None, f"/formations/{FORMATION}/quiz-global"),
        ("micro_session", None, None, f"/formations/{FORMATION}/quiz-global?mode=micro"),
        ("warmup", None, None, "/accueil#echauffement"),
        ("weekly_review", None, None, "/accueil#bilan"),
        ("buffer", None, None, f"/agenda?vue=jour&date={DATE}"),
        ("unknown", None, None, f"/formations/{FORMATION}"),
    ],
    ids=[
        "contributions",
        "course-root",
        "course-module",
        "exercise-programme",
        "exercise-module",
        "exercise-activity",
        "validation-quiz",
        "mock-exam",
        "global-quiz",
        "revision",
        "sprint",
        "micro-session",
        "warmup",
        "weekly-review",
        "buffer",
        "unknown",
    ],
)
def test_slot_targets_are_derived_from_the_kind(
    kind: str, module_id: str | None, activity_id: str | None, expected: str
) -> None:
    href = slot_href(
        kind=kind, formation_id=FORMATION, module_id=module_id, activity_id=activity_id, date=DATE
    )
    assert href == expected


def test_the_twelve_kinds_carry_their_french_label() -> None:
    assert slot_label("course") == "Cours"
    assert slot_label("buffer") == "Marge de rattrapage"
    assert slot_label("weekly_review") == texts.AGENDA_SLOT_LABELS["weekly_review"]
    assert slot_label("inconnu") == "inconnu"
    assert len(texts.AGENDA_SLOT_LABELS) == 12


def test_the_totals_ignore_the_margins_and_count_the_remaining_ones() -> None:
    slots: list[dict[str, Any]] = [
        {
            "kind": "course",
            "status": "done",
            "startsAt": "2026-11-09T09:00:00.000Z",
            "endsAt": "2026-11-09T10:00:00.000Z",
        },
        {
            "kind": "exercise",
            "status": "planned",
            "startsAt": "2026-11-09T10:00:00.000Z",
            "endsAt": "2026-11-09T10:30:00.000Z",
        },
        {
            "kind": "buffer",
            "status": "planned",
            "startsAt": "2026-11-10T09:00:00.000Z",
            "endsAt": "2026-11-10T10:00:00.000Z",
        },
        {
            "kind": "buffer",
            "status": "done",
            "startsAt": "2026-11-11T09:00:00.000Z",
            "endsAt": "2026-11-11T10:00:00.000Z",
        },
    ]
    assert agenda_totals(slots) == {
        "plannedMinutes": 90,
        "doneMinutes": 60,
        "marginsRemaining": 1,
    }
    assert agenda_totals([]) == {"plannedMinutes": 0, "doneMinutes": 0, "marginsRemaining": 0}


def test_a_forgetting_gap_opens_the_targeted_global_quiz() -> None:
    target = training_target(formation_id=FORMATION, module_id=MODULE, notion_id=NOTION, nature="forgetting")
    assert target == {
        "kind": "quiz",
        "href": f"/formations/{FORMATION}/quiz-global?cible={NOTION}",
    }


def test_an_application_gap_opens_the_exercise() -> None:
    target = training_target(formation_id=FORMATION, module_id=MODULE, notion_id=NOTION, nature="application")
    assert target == {
        "kind": "exercise",
        "href": f"/formations/{FORMATION}/modules/{MODULE}/exercices?notion={NOTION}",
    }


def test_the_course_link_only_exists_for_a_live_anchored_section() -> None:
    assert course_target(formation_id=FORMATION, module_id=MODULE, chapter_id=CHAPTER, section=None) is None
    assert (
        course_target(
            formation_id=FORMATION,
            module_id=MODULE,
            chapter_id=CHAPTER,
            section={"sectionId": SECTION, "anchor": "   "},
        )
        is None
    )
    link = course_target(
        formation_id=FORMATION,
        module_id=MODULE,
        chapter_id=CHAPTER,
        section={"sectionId": SECTION, "anchor": " les-comptes "},
    )
    assert link == {
        "sectionId": SECTION,
        "anchor": "les-comptes",
        "href": f"/formations/{FORMATION}/modules/{MODULE}/cours?chapitre={CHAPTER}#les-comptes",
    }


def test_the_agenda_window_must_be_ordered_and_at_most_forty_two_days() -> None:
    apply_refinement("agenda.get", {"from_": "2026-11-01", "to": "2026-11-11"})
    apply_refinement("agenda.get", {"from_": "2026-11-01", "to": "2026-12-13"})

    with pytest.raises(AppError) as reversed_range:
        apply_refinement("agenda.get", {"from_": "2026-11-11", "to": "2026-11-01"})
    assert reversed_range.value.extra["errors"] == [{"path": "query", "message": texts.AGENDA_RANGE_ORDER}]

    with pytest.raises(AppError) as too_wide:
        apply_refinement("agenda.get", {"from_": "2026-11-01", "to": "2026-12-14"})
    assert too_wide.value.extra["errors"] == [{"path": "query", "message": texts.AGENDA_RANGE_TOO_WIDE}]
