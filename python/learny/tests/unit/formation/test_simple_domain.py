"""[SPEC-4001] Pure rules of simple mode: guessed role, module bounds, deadline (CA-3, CA-6)."""

import pytest
from learny.formation.domain import simple as rules
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-4001")


def test_guess_role_reads_annales_as_exam_papers() -> None:
    assert rules.guess_role(name="Annales DCG 2023", is_first=True) == "exam_papers"
    assert rules.guess_role(name="Sujet d examen", is_first=False) == "exam_papers"
    assert rules.guess_role(name="Session 2023", first_pages="SESSION 2021") == "exam_papers"


def test_guess_role_reads_td_as_exercises() -> None:
    assert rules.guess_role(name="TD corriges", is_first=True) == "exercises"
    assert rules.guess_role(name="Exercices du chapitre 2", is_first=False) == "exercises"
    assert rules.guess_role(name="cours", first_pages="Travaux diriges") == "exercises"


def test_guess_role_is_accent_and_case_insensitive() -> None:
    assert rules.guess_role(name="ANNALES du DCG") == "exam_papers"
    assert rules.guess_role(name="Exercices du TD 4") == "exercises"


def test_guess_role_defaults_to_course_then_other() -> None:
    assert rules.guess_role(name="Comptabilite generale", is_first=True) == "course"
    assert rules.guess_role(name="Comptabilite generale", is_first=False) == "other"


def test_a_document_named_td_does_not_hide_the_course_word() -> None:
    # EF-4 - `td` is matched on word boundaries, never inside another word.
    assert rules.guess_role(name="methodologie", is_first=True) == "course"


def test_ensure_course_promotes_the_longest_document() -> None:
    assert rules.ensure_course(["other", "other"], [10, 50]) == ["other", "course"]
    assert rules.ensure_course(["course", "other"], [10, 50]) == ["course", "other"]
    assert rules.ensure_course([], []) == []


def test_plan_programme_merges_short_sections_into_two_hour_modules() -> None:
    sections = [
        rules.DetectedSection(position=index + 1, title=f"Section {index + 1}", hours=1.0)
        for index in range(4)
    ]
    modules = rules.plan_programme(sections)
    assert len(modules) == 2
    assert [module.position for module in modules] == [1, 2]
    assert modules[0].hours == pytest.approx(2.0)
    assert [module.title for module in modules] == ["Section 1", "Section 3"]


def test_plan_programme_splits_a_long_section() -> None:
    sections = [rules.DetectedSection(position=1, title="Tout le document", hours=10.0)]
    modules = rules.plan_programme(sections)
    assert len(modules) == 2
    assert modules[0].hours == pytest.approx(rules.MODULE_MAX_HOURS)
    assert modules[1].hours >= rules.MODULE_MIN_HOURS
    assert modules[1].title.endswith("(2)")


def test_plan_programme_keeps_the_page_ranges() -> None:
    sections = [
        rules.DetectedSection(position=1, title="A", page_from=1, page_to=20),
        rules.DetectedSection(position=2, title="B", page_from=21, page_to=40),
    ]
    modules = rules.plan_programme(sections)
    assert modules[0].page_from == 1
    assert modules[0].page_to == 40


def test_chapters_stay_between_twenty_and_forty_five_minutes() -> None:
    for hours in (2.0, 3.0, 4.0, 6.0, 8.0):
        minutes = rules.chapter_minutes(hours)
        assert rules.CHAPTER_MIN_MINUTES - 1e-9 <= minutes <= rules.CHAPTER_MAX_MINUTES + 1e-9
        assert rules.chapters_for_module(hours) >= 1


def test_deadline_ends_the_plan_fourteen_days_before() -> None:
    assert rules.deadline_end_date("2026-12-31", "2026-11-11") == "2026-12-17"
    # A deadline too close to leave the margin never moves the plan into the past.
    assert rules.deadline_end_date("2026-11-20", "2026-11-11") == "2026-11-11"


def test_deadline_sets_the_exam_objective_and_its_removal_restores_operational() -> None:
    assert rules.deadline_objectives("2026-12-31") == ("exam",)
    assert rules.deadline_objectives(None) == ("operational",)


def test_a_too_close_deadline_is_refused_with_the_existing_date_label() -> None:
    with pytest.raises(AppError) as failure:
        rules.assert_deadline("2026-11-20", "2026-11-11")
    assert failure.value.code == "VALIDATION_FAILED"
    assert failure.value.status == 422
    rules.assert_deadline("2026-11-30", "2026-11-11")


def test_a_module_is_acquired_only_when_every_answer_is_right() -> None:
    results = {"m1": [True, True], "m2": [True, False], "m3": []}
    assert rules.progress_after_diagnostic(["m1", "m2", "m3"], results) == ["m1"]


def test_deduced_profile_fills_every_rubric_without_a_question() -> None:
    payload = {
        "volumeHours": 12,
        "modules": [{"plannedStart": "2026-11-11", "plannedEnd": "2026-11-20"}],
    }
    profile = rules.deduced_profile(
        payload,
        scope_label="Document",
        beginner_label="Debutant",
        mastery_label="Maitrise",
        volume_label="{hours} heures",
        dates_label="Du {start} au {end}",
    )
    assert set(profile) == {"scope", "starting_point", "target_level", "volume", "dates"}
    assert all(entry["state"] == "done" for entry in profile.values())
    assert profile["dates"]["value"] == "Du 2026-11-11 au 2026-11-20"
