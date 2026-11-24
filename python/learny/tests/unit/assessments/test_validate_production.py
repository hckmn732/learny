"""[SPEC-613] Validation of a practice production.

The pure validator runs before any tutor call: the typed columns, the declared `sum_equal` control
and the written explanation are code rules, never model-provided JavaScript (ADR-0027). Each
case replays one reference case of the production validation; the expected messages come from
the French locale constants, never from a literal.
"""

from typing import Any

import pytest
from learny.assessments.domain.exercise import parse_instruction, parse_submission, validate_production
from learny.shared.locale_fr import assessments as texts

pytestmark = pytest.mark.spec("SPEC-2202")


def table_instruction() -> dict[str, Any]:
    """The `tableInstruction` fixture of the reference suite, same shape."""
    parsed = parse_instruction(
        {
            "title": "Piece equilibree",
            "taskMd": "Fill the accounting entry and explain the double entry rule.",
            "data": ["Company FR01", "Currency: EUR"],
            "deliverable": "A balanced table and an explanation.",
            "production": {
                "kind": "table",
                "fields": [
                    {
                        "key": "type",
                        "label": "Piece type",
                        "type": "select",
                        "options": [{"value": "SA", "label": "SA general entry"}],
                    }
                ],
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
                "maxRows": 4,
                "initialRows": 2,
                "checks": [
                    {
                        "type": "sum_equal",
                        "numberColumn": "montant",
                        "groupColumn": "cle",
                        "left": ["40"],
                        "right": ["50"],
                        "leftLabel": "Debit",
                        "rightLabel": "Credit",
                        "sideColumnLabel": "Side",
                    }
                ],
            },
            "explanationPrompt": "Why must an entry be balanced?",
            "hints": ["First hint", "Second hint"],
            "criteria": [
                {"key": "a", "label": "Charge line", "points": 4, "description": "The line is right."},
                {"key": "b", "label": "Balance", "points": 4, "description": "Totals are equal."},
                {
                    "key": "c",
                    "label": "Explanation",
                    "points": 2,
                    "description": "The rule is explained.",
                },
            ],
            "estimatedMinutes": 15,
            "passPoints": 8,
            "sources": [],
        }
    )
    assert parsed is not None
    return parsed


def table_submission(montant_right: str = "120") -> dict[str, Any]:
    """The `tableSubmission` fixture of the reference suite, same shape."""
    parsed, issues = parse_submission(
        {
            "kind": "table",
            "fields": {"type": "SA"},
            "rows": [
                {"cle": "40", "montant": montant_right},
                {"cle": "50", "montant": "120"},
            ],
            "explanation": "In double entry, every debit is credited elsewhere.",
        }
    )
    assert parsed is not None, issues
    return parsed


def test_accepts_a_typed_and_balanced_table() -> None:
    assert validate_production(table_instruction(), table_submission()) == []


def test_refuses_an_unbalanced_piece_before_any_tutor_call() -> None:
    issues = validate_production(table_instruction(), table_submission("100"))

    difference = texts.TABLE_CHECK_EURO.format(amount="20")
    expected = {"path": "rows", "message": texts.TABLE_CHECK_DIFFERENCE.format(amount=difference)}
    assert expected in issues


def test_reports_the_cell_whose_type_violates_the_column() -> None:
    submission = table_submission()
    submission["rows"] = [
        {"cle": "40", "montant": "douze"},
        {"cle": "50", "montant": "120"},
    ]

    issues = validate_production(table_instruction(), submission)

    assert {
        "path": "rows.0.montant",
        "message": texts.EXERCISE_CELL_NUMBER.format(label="Montant"),
    } in issues


def test_refuses_a_value_absent_from_the_typed_list() -> None:
    submission = table_submission()
    submission["rows"] = [
        {"cle": "99", "montant": "120"},
        {"cle": "50", "montant": "120"},
    ]

    issues = validate_production(table_instruction(), submission)

    assert {
        "path": "rows.0.cle",
        "message": texts.EXERCISE_CELL_SELECT.format(label="Cle"),
    } in issues


def test_requires_the_written_explanation() -> None:
    submission = table_submission()
    submission["explanation"] = "court"

    issues = validate_production(table_instruction(), submission)

    assert {"path": "explanation", "message": texts.EXERCISE_EXPLANATION_REQUIRED} in issues


def test_accepts_text_file_and_link_productions_of_their_own_kind() -> None:
    instruction = table_instruction()
    text = parse_instruction({**instruction, "production": {"kind": "text", "minChars": 3, "maxChars": 200}})
    assert text is not None
    text_submission, issues = parse_submission(
        {
            "kind": "text",
            "text": "An answer",
            "explanation": "A long enough explanation to be accepted by the check.",
        }
    )
    assert issues == []
    assert text_submission is not None
    assert validate_production(text, text_submission) == []

    file = parse_instruction(
        {
            **instruction,
            "production": {"kind": "file", "accept": ["application/pdf"], "maxSizeMb": 5},
        }
    )
    assert file is not None
    file_submission, issues = parse_submission(
        {
            "kind": "file",
            "resourceId": "6f0e8f9a-0c45-4de2-a7dd-4f5c5a5f9fc0",
            "explanation": "A long enough explanation to be accepted by the check.",
        }
    )
    assert issues == []
    assert file_submission is not None
    assert validate_production(file, file_submission) == []

    link = parse_instruction({**instruction, "production": {"kind": "link"}})
    assert link is not None
    link_submission, issues = parse_submission(
        {
            "kind": "link",
            "url": "https://example.test/rendu",
            "explanation": "A long enough explanation to be accepted by the check.",
        }
    )
    assert issues == []
    assert link_submission is not None
    assert validate_production(link, link_submission) == []
