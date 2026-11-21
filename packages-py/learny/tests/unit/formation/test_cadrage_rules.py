"""[SPEC-2201] Pure rules of the scoping chat (port of cadrage/apply-tutor-turn.ts)."""

import pytest
from learny.formation.domain.cadrage import (
    ApplyConstraints,
    CadrageTurn,
    Done,
    apply_turn,
    build_state,
    cadrage_scenario,
    empty_profile,
    read_profile,
)
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import CADRAGE_AI_TASK_FAILED, CADRAGE_DONE_FALLBACK

pytestmark = pytest.mark.spec("SPEC-2201")


def test_read_profile_completes_the_five_rubrics() -> None:
    profile = read_profile({"scope": {"value": "SAP", "state": "done"}, "volume": "nope"})
    assert list(profile) == ["scope", "starting_point", "target_level", "volume", "dates"]
    assert profile["scope"] == {"value": "SAP", "state": "done"}
    assert profile["volume"] == {"value": None, "state": "todo"}


def test_a_question_sets_the_rubric_waiting() -> None:
    turn = CadrageTurn.model_validate(
        {
            "next": {
                "kind": "question",
                "questionKey": "scope",
                "text": "Quel perimetre ?",
                "multi": False,
                "suggestions": [{"label": "FI", "value": "fi"}],
            }
        }
    )
    applied = apply_turn(empty_profile(), turn, ApplyConstraints(questions_asked=0))
    assert applied.questionsAsked == 1
    assert applied.questionNumber == 1
    assert applied.profile["scope"]["state"] == "waiting"
    assert applied.finished is False


def test_a_sixth_question_is_replaced_by_the_conclusion() -> None:
    turn = CadrageTurn.model_validate(
        {
            "next": {
                "kind": "question",
                "questionKey": "dates",
                "text": "Quand ?",
                "multi": False,
                "suggestions": [],
            }
        }
    )
    applied = apply_turn(empty_profile(), turn, ApplyConstraints(questions_asked=5))
    assert applied.finished is True
    assert applied.content == CADRAGE_DONE_FALLBACK


def test_a_multiple_choice_needs_two_suggestions() -> None:
    turn = CadrageTurn.model_validate(
        {
            "next": {
                "kind": "question",
                "questionKey": "scope",
                "text": "Perimetre ?",
                "multi": True,
                "suggestions": [{"label": "FI", "value": "fi"}],
            }
        }
    )
    with pytest.raises(AppError) as failure:
        apply_turn(empty_profile(), turn, ApplyConstraints(questions_asked=0))
    assert failure.value.code == "INVALID_OUTPUT"


def test_duplicate_suggestion_values_are_refused() -> None:
    turn = CadrageTurn.model_validate(
        {
            "next": {
                "kind": "question",
                "questionKey": "scope",
                "text": "Perimetre ?",
                "multi": False,
                "suggestions": [
                    {"label": "A", "value": "x"},
                    {"label": "B", "value": "x"},
                ],
            }
        }
    )
    with pytest.raises(AppError):
        apply_turn(empty_profile(), turn, ApplyConstraints(questions_asked=0))


def test_the_learner_answer_completes_the_answered_rubric() -> None:
    turn = CadrageTurn(next=Done(kind="done", text="Termine."))
    applied = apply_turn(
        empty_profile(),
        turn,
        ApplyConstraints(
            questions_asked=1, pending_question_key="scope", learner_answer="  Module FI  "
        ),
    )
    assert applied.profile["scope"] == {"value": "Module FI", "state": "done"}
    assert applied.finished is True


def test_objectives_are_deduplicated() -> None:
    turn = CadrageTurn.model_validate(
        {"objectives": ["exam", "exam", "project"], "next": {"kind": "done", "text": "Fini."}}
    )
    applied = apply_turn(empty_profile(), turn, ApplyConstraints(questions_asked=0))
    assert applied.objectives == ["exam", "project"]


def test_scenarios_follow_the_title_marker() -> None:
    assert cadrage_scenario("SAP S/4HANA Finance", 0) == "cadrage-sap-q1"
    assert cadrage_scenario("SAP S/4HANA Finance", 9) == "cadrage-sap-done"
    assert cadrage_scenario("Formation invalide", 0) == "cadrage-invalid"
    assert cadrage_scenario("Sixieme question", 0) == "cadrage-sixth-question"
    assert cadrage_scenario("Test injection", 0) == "cadrage-injection"


def test_build_state_reports_an_interrupted_turn() -> None:
    class Row:
        id = "m1"
        role = "learner"
        content = "SAP"
        question_key = None
        suggestions = None
        position = 1
        created_at = __import__("datetime").datetime.fromisoformat("2026-11-11T12:20:00+00:00")

    class Formation:
        id = "f1"
        title = "SAP"
        cadrage_profile = None

    state = build_state(Formation(), [Row()])
    assert state["error"] == {"code": "AI_TASK_FAILED", "message": CADRAGE_AI_TASK_FAILED}
    assert state["canGenerate"] is False
    assert state["pendingQuestion"] is None
