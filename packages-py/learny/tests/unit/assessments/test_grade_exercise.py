"""[SPEC-613] Correction of a practice exercise (ported from `grade-exercise.test.ts`).

The deterministic tutor is the committed `LLM_MODE=mock` fixture; the raw sub-scores are bounded by
`normalize_tutor_correction` before anything is persisted or displayed, and the hint penalty is
applied after the scale (CL-5). Each case is the Python port of a Vitest case of
`packages/services/src/exercises/grade-exercise.test.ts`.
"""

from typing import Any

import pytest
from learny.assessments.domain.exercise import (
    grade_exercise,
    normalize_tutor_correction,
    parse_instruction,
    parse_submission,
)

pytestmark = pytest.mark.spec("SPEC-2202")

NEXT_STEP = {"label": "Next step: consolidate the notion.", "href": "/programme"}


def instruction() -> dict[str, Any]:
    """The `instruction` fixture of the TypeScript test, same shape."""
    parsed = parse_instruction(
        {
            "title": "Piece equilibree",
            "taskMd": "Fill the accounting entry and explain the double entry rule.",
            "data": [],
            "deliverable": "A balanced table.",
            "production": {
                "kind": "table",
                "fields": [],
                "columns": [
                    {
                        "key": "cle",
                        "label": "Cle",
                        "type": "select",
                        "options": [
                            {"value": "40", "label": "40 debit"},
                            {"value": "50", "label": "50 credit"},
                        ],
                    },
                    {"key": "montant", "label": "Montant", "type": "number"},
                ],
                "minRows": 2,
                "maxRows": 2,
                "initialRows": 2,
                "checks": [
                    {
                        "type": "sum_equal",
                        "numberColumn": "montant",
                        "groupColumn": "cle",
                        "left": ["40"],
                        "right": ["50"],
                    }
                ],
            },
            "explanationPrompt": "Why must an entry be balanced?",
            "hints": ["First hint", "Second hint"],
            "criteria": [
                {"key": "a", "label": "Charge line", "points": 2, "description": "Line is right."},
                {"key": "b", "label": "Bank line", "points": 2, "description": "Bank is right."},
                {"key": "c", "label": "Balanced entry", "points": 2, "description": "Equal totals."},
                {"key": "d", "label": "Piece type", "points": 2, "description": "Type SA."},
                {
                    "key": "explication",
                    "label": "Explanation",
                    "points": 2,
                    "description": "Double entry explained.",
                },
            ],
            "estimatedMinutes": 15,
            "passPoints": 8,
            "sources": [],
        }
    )
    assert parsed is not None
    return parsed


def submission() -> dict[str, Any]:
    """The `SUBMISSION` fixture of the TypeScript test, same shape."""
    parsed, issues = parse_submission(
        {
            "kind": "table",
            "fields": {},
            "rows": [
                {"cle": "40", "montant": "120"},
                {"cle": "50", "montant": "120"},
            ],
            "explanation": "In double entry, every debit is credited elsewhere.",
        }
    )
    assert parsed is not None, issues
    return parsed


def test_applies_a_ten_point_scale_and_a_sub_score_per_criterion() -> None:
    result = grade_exercise(instruction(), submission(), hints_used=0, next_step=NEXT_STEP)

    assert result["ok"] is True
    value = result["value"]
    assert value["maxScore"] == 10
    assert value["score"] == 10
    assert len(value["criteria"]) == 5
    assert [criterion["points"] for criterion in value["criteria"]] == [2, 2, 2, 2, 2]
    assert value["verdict"] == "passed"


def test_removes_one_maximum_point_per_used_hint() -> None:
    one = grade_exercise(instruction(), submission(), hints_used=1, next_step=NEXT_STEP)
    two = grade_exercise(instruction(), submission(), hints_used=2, next_step=NEXT_STEP)

    assert one["value"]["maxScore"] == 9
    assert two["value"]["maxScore"] == 8
    assert one["value"]["score"] == 9
    assert two["value"]["score"] == 8


def test_refuses_an_out_of_scale_tutor_correction_then_bounds_it() -> None:
    raw = {
        "scores": [
            {"key": "a", "earned": 9, "comment": "Too high."},
            {"key": "b", "earned": -1, "comment": "Negative."},
            {"key": "c", "earned": float("nan"), "comment": "Not finite."},
            {"key": "d", "earned": 2, "comment": "Right."},
            {"key": "explication", "earned": 2, "comment": "Right."},
        ],
        "summary": "Raw out-of-scale correction.",
    }

    normalized = normalize_tutor_correction(instruction(), raw)

    assert normalized["rejectedKeys"] == ["a", "b", "c"]
    assert [criterion["earned"] for criterion in normalized["criteria"]] == [2, 0, 0, 2, 2]

    def tutor(_instruction: Any, _submission: Any) -> dict[str, Any]:
        return raw

    result = grade_exercise(instruction(), submission(), hints_used=0, next_step=NEXT_STEP, tutor=tutor)

    assert result["ok"] is True
    assert result["value"]["score"] == 6
    assert result["value"]["verdict"] == "retry"


def test_never_exceeds_the_maximum_reduced_by_the_hints() -> None:
    result = grade_exercise(instruction(), submission(), hints_used=2, next_step=NEXT_STEP)

    assert result["ok"] is True
    assert result["value"]["score"] <= result["value"]["maxScore"]


def test_refuses_an_invalid_production_without_calling_the_tutor() -> None:
    called = False

    def tutor(_instruction: Any, _submission: Any) -> dict[str, Any]:
        nonlocal called
        called = True
        return {"scores": [], "summary": "never"}

    invalid = submission()
    invalid["rows"] = [
        {"cle": "40", "montant": "12"},
        {"cle": "50", "montant": "120"},
    ]

    result = grade_exercise(instruction(), invalid, hints_used=0, next_step=NEXT_STEP, tutor=tutor)

    assert result["ok"] is False
    assert called is False


def test_requires_a_criterion_sum_equal_to_ten_in_the_contract() -> None:
    incomplete = {
        **instruction(),
        "criteria": [{"key": "a", "label": "Unique", "points": 9, "description": "Incomplete scale."}],
    }

    assert parse_instruction(incomplete) is None
