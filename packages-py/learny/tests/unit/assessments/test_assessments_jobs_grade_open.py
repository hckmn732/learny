"""Pure parts of the open-answer correction (SPEC-2207, port of `grade-open.ts`).

The learner text never becomes an instruction: it is escaped inside its tag. The schema bounds the
score and the readable fields exactly like the Zod schema of the TypeScript service.
"""

from collections.abc import Mapping
from typing import Any

import pytest
from learny.assessments.application.grade_open import (
    GRADING_ATTEMPTS,
    OpenGrade,
    escape_data,
    prompt_of,
    text_of,
)
from learny.shared.locale_fr import assessments as texts
from pydantic import ValidationError

pytestmark = pytest.mark.spec("SPEC-2207")

NOTION = "Double entry"


def item_of(payload: Mapping[str, Any] | None = None) -> dict[str, Any]:
    return {"notionLabel": NOTION, "payload": payload}


def open_payload() -> dict[str, Any]:
    return {
        "stem": "Explain why the bank account is debited.",
        "answerMaxChars": 600,
        "expectedElements": ["The receipt increases an asset"],
        "modelAnswer": "An asset account increases on the debit side.",
        "explanation": "A debit entry increases an asset account.",
        "objective": "Read a double entry",
        "criteria": [
            {"key": "exactness", "label": "Exactness", "points": 1, "description": "The rule is stated."}
        ],
        "sources": [],
    }


def test_the_learner_text_is_escaped_inside_its_tag() -> None:
    assert escape_data("<script>&") == "&lt;script&gt;&amp;"

    prompt = prompt_of(item_of(open_payload()), "<b>debited</b>")

    assert f"{texts.OPEN_GRADE_NOTION.format(notion=NOTION)}" in prompt
    assert texts.OPEN_GRADE_STEM.format(stem="Explain why the bank account is debited.") in prompt
    assert texts.OPEN_GRADE_EXPECTED_ITEM.format(index=1, element="The receipt increases an asset") in prompt
    assert texts.OPEN_GRADE_CRITERION.format(key="exactness", label="Exactness", points=1) in prompt
    assert "&lt;b&gt;debited&lt;/b&gt;" in prompt
    assert "<b>debited</b>" not in prompt
    assert prompt.endswith(texts.OPEN_GRADE_INSTRUCTIONS[-1])


def test_a_missing_payload_still_produces_a_prompt() -> None:
    prompt = prompt_of(item_of(None), "")

    assert texts.OPEN_GRADE_HEADER in prompt
    assert texts.OPEN_GRADE_EXPECTED_HEADER in prompt
    assert texts.OPEN_GRADE_LEARNER_TAG.format(response="") in prompt


def test_the_three_attempts_of_the_correction_are_declared() -> None:
    assert GRADING_ATTEMPTS == 3


def test_the_text_of_an_answer_is_trimmed() -> None:
    assert text_of({"text": "  an asset  "}) == "an asset"
    assert text_of({"text": 12}) == ""
    assert text_of(None) == ""


def test_the_grade_is_bounded_to_one() -> None:
    valid = OpenGrade(score=0.75, explanation="Right rule.", criteria=[], missing=[])
    assert valid.offTopic is False

    with pytest.raises(ValidationError):
        OpenGrade(score=1.5, explanation="Right rule.", criteria=[], missing=[])
    with pytest.raises(ValidationError):
        OpenGrade(score=0.5, explanation="  ", criteria=[], missing=[])
