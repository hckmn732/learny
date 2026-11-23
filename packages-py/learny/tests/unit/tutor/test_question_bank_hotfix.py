"""Hotfix QA of the question banks (SPEC-513 port): notion ids, payload guide, variant echoes."""

import json
from typing import Any

import pytest
from learny.tutor.application.question_bank import (
    QuestionBankOutput,
    build_prompt,
    normalize_notion_ids,
    payload_guide,
)
from learny.tutor.domain.question_bank import QUESTION_BANK_FORMATS

pytestmark = pytest.mark.spec("SPEC-2207")

TARGET = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
BY_KEY = {TARGET: TARGET, "balance sheet": TARGET, OTHER: OTHER, "income statement": OTHER}


def test_labels_and_invented_ids_are_mapped_to_known_notions() -> None:
    payload: dict[str, Any] = {
        "options": [
            {"id": "a", "correct": True, "notionId": "Balance Sheet"},
            {"id": "b", "correct": False, "notionId": " Income Statement "},
            {"id": "c", "correct": False, "notionId": "made-up-notion"},
            {"id": "d", "correct": False, "notionId": TARGET},
        ],
        "pairs": [{"notionId": "unknown"}],
    }

    normalized = normalize_notion_ids(payload, BY_KEY, TARGET, OTHER)

    assert [option["notionId"] for option in normalized["options"]] == [TARGET, OTHER, OTHER, OTHER]
    assert normalized["pairs"] == [{"notionId": TARGET}]
    assert payload["options"][0]["notionId"] == "Balance Sheet"


def test_a_wrong_option_keeps_the_target_when_no_other_notion_exists() -> None:
    payload = {"options": [{"correct": False, "notionId": "x"}]}
    assert normalize_notion_ids(payload, {TARGET: TARGET}, TARGET, None) == {
        "options": [{"correct": False, "notionId": TARGET}]
    }


@pytest.mark.parametrize("format_name", QUESTION_BANK_FORMATS)
def test_every_bank_format_has_its_payload_json_schema(format_name: str) -> None:
    schema = json.loads(payload_guide(format_name))
    assert schema["type"] == "object"
    assert schema["properties"]


def test_the_prompt_gives_the_schema_and_asks_for_french() -> None:
    request = build_prompt({"label": "Bilan"}, "choice_question", 3, [], None)
    content = str(request.messages[0]["content"])
    assert "JSON Schema of a choice_question payload: {" in content
    assert "in French" in content


def test_the_variant_echoes_of_the_model_are_optional() -> None:
    output = QuestionBankOutput.model_validate({"variants": [{"payload": {"stem": "Question?"}}]})
    assert output.variants[0].notionId is None
    assert output.variants[0].format is None
