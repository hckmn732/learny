"""[SPEC-2202] Text normalization of the brick contract (SPEC-501, ADR-0151, BR-MEM-05).

Ported from `packages/bricks/src/normalize.test.ts`. The expected forms are the recordings of the
TypeScript implementation taken on 2026-11-21 from the same inputs. Every non-ASCII input is
written as an escape so this module stays plain ASCII (ADR-2011).
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.assessments.domain.bricks.normalize import comparison_key, normalize_text

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "bricks_contract.json").read_text(encoding="utf-8")
)
CASES = FIXTURE["normalize"]


@pytest.mark.parametrize("case", CASES, ids=[case["input"][:24] for case in CASES])
def test_normalization_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    assert normalize_text(case["input"]) == case["output"]


@pytest.mark.parametrize("case", CASES, ids=[case["input"][:24] for case in CASES])
def test_the_comparison_key_is_the_normalized_form(case: dict[str, Any]) -> None:
    assert comparison_key(case["input"]) == case["key"]


@pytest.mark.parametrize("case", CASES, ids=[case["input"][:24] for case in CASES])
def test_normalization_is_idempotent(case: dict[str, Any]) -> None:
    assert normalize_text(case["output"]) == case["output"]


def test_apostrophes_quotes_dashes_and_spaces_are_folded_to_ascii() -> None:
    assert normalize_text("l\u2019\u00e9t\u00e9") == "l'ete"
    assert normalize_text("\u00ab oui \u00bb") == '" oui "'
    assert normalize_text("\u2013\u2014") == "--"
    assert normalize_text("a\u00a0b\u2009c") == "a b c"


def test_diacritics_are_removed_and_case_is_lowered() -> None:
    assert normalize_text("\u00c9TAT DE R\u00c9SULTAT") == "etat de resultat"


def test_trailing_punctuation_is_dropped() -> None:
    assert normalize_text("Vraiment ?") == "vraiment"
    assert normalize_text("Oui...") == "oui"
    assert normalize_text("Fin ;") == "fin"


def test_a_lone_space_is_normalized_to_the_empty_string() -> None:
    assert normalize_text("   ") == ""
    assert comparison_key(".") == ""
