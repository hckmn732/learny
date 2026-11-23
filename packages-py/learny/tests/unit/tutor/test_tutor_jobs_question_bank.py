"""Pure rules of the personal question banks (SPEC-2207)."""

import pytest
from learny.shared.locale_fr import tutor as texts
from learny.tutor.domain.question_bank import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    QUESTION_BANK_FORMATS,
    QUESTION_BANK_MIN_VARIANTS,
    QUESTION_BANK_REGENERATION_SCENARIO,
    QUESTION_BANK_SCENARIO,
    clamp_limit,
    distractors_of,
    generation_query,
    group_of,
    location_of,
    replace_placeholders,
    scenario_for,
)

pytestmark = pytest.mark.spec("SPEC-2207")

NOTION = "11111111-1111-4111-8111-111111111111"


def choice_payload() -> dict[str, object]:
    return {
        "stem": "Which account increases on debit?",
        "mode": "single",
        "options": [
            {"id": "a", "text": "The bank account", "correct": True, "notionId": NOTION},
            {
                "id": "b",
                "text": "The capital account",
                "correct": False,
                "notionId": "22222222-2222-4222-8222-222222222222",
                "rationale": "Frequent confusion.",
            },
        ],
        "sources": [],
    }


def test_the_four_formats_and_the_minimum_variants() -> None:
    assert QUESTION_BANK_FORMATS == ("choice_question", "open_question", "cloze", "matching")
    assert QUESTION_BANK_MIN_VARIANTS == 4


def test_the_batch_is_bounded_to_fifty_rows() -> None:
    assert DEFAULT_LIMIT == 20
    assert MAX_LIMIT == 50
    assert clamp_limit(None) == 20
    assert clamp_limit(0) == 1
    assert clamp_limit(50) == 50
    assert clamp_limit(51) == 50
    assert clamp_limit(-3) == 1


def test_the_scenario_follows_the_reason() -> None:
    assert scenario_for("course_generated", None) == QUESTION_BANK_SCENARIO
    assert scenario_for("exhaustion", None) == QUESTION_BANK_REGENERATION_SCENARIO
    assert scenario_for("exhaustion", "manual-scenario") == "manual-scenario"


def test_the_placeholders_are_substituted_everywhere() -> None:
    payload = {"notionId": "{{notionId}}", "options": [{"notionId": "{{distractorNotionId}}"}]}
    replaced = replace_placeholders(payload, NOTION)
    assert replaced == {"notionId": NOTION, "options": [{"notionId": NOTION}]}
    assert payload["notionId"] == "{{notionId}}"


def test_the_distractors_keep_their_notion_and_cap_at_five() -> None:
    labels = {"22222222-2222-4222-8222-222222222222": "Capital"}
    found = distractors_of(choice_payload(), labels)
    assert found == [
        {
            "notionId": "22222222-2222-4222-8222-222222222222",
            "label": "Capital",
            "rationale": "Frequent confusion.",
        }
    ]
    without_label = distractors_of(choice_payload(), {})
    assert without_label[0]["label"] == texts.QUESTION_BANK_NOTION_FALLBACK
    assert distractors_of({}, labels) == []


def test_the_generation_query_joins_the_label_and_the_definition() -> None:
    assert generation_query({"label": "Double entry", "short_definition": "Two sides"}) == (
        "Double entry \u2014 Two sides"
    )
    assert generation_query({"label": "Double entry", "short_definition": None}) == "Double entry"


def test_a_group_is_complete_at_the_requested_count() -> None:
    assert group_of(NOTION, "cloze", 4, 4, 4, 0)["complete"] is True
    assert group_of(NOTION, "cloze", 4, 3, 3, 1)["complete"] is False
    assert group_of(NOTION, "cloze", 4, 5, 0, 0) == {
        "notionId": NOTION,
        "format": "cloze",
        "required": 4,
        "available": 5,
        "inserted": 0,
        "duplicates": 0,
        "complete": True,
    }


def test_a_location_keeps_the_documented_keys_only() -> None:
    assert location_of('{"page": 3, "charStart": 10, "charEnd": 20, "unknown": 1}') == {
        "page": 3,
        "charStart": 10,
        "charEnd": 20,
    }
    assert location_of(None) == {"charStart": 0, "charEnd": 0}
