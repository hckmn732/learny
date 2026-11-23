"""[SPEC-2202] Fingerprint of the question types (SPEC-501 ET-6, BR-BRI-07, ADR-0151).

The expected digests are the reference recordings.
"""

import copy
import json
from pathlib import Path
from typing import Any

import pytest
from learny.assessments.domain.bricks.fingerprint import (
    brick_fingerprint,
    canonical_answer,
    stem_text,
)
from learny.assessments.domain.bricks.normalize import normalize_text

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "bricks_contract.json").read_text(encoding="utf-8")
)
CASES = FIXTURE["fingerprints"]
PAYLOADS = {type_name: entry["normalized"] for type_name, entry in FIXTURE["examples"].items()}


@pytest.mark.parametrize("case", CASES, ids=[case["type"] for case in CASES])
def test_the_fingerprint_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    assert brick_fingerprint(case["type"], case["payload"]) == case["fingerprint"]


@pytest.mark.parametrize("case", CASES, ids=[case["type"] for case in CASES])
def test_the_stem_and_the_canonical_answer_match(case: dict[str, Any]) -> None:
    assert stem_text(case["type"], case["payload"]) == case["stem"]
    assert canonical_answer(case["type"], case["payload"]) == case["answer"]


@pytest.mark.parametrize(
    "type_name",
    ["text", "resource_excerpt", "instruction", "scripted_dialogue", "timer", "scoring"],
)
def test_a_non_question_brick_has_no_fingerprint(type_name: str) -> None:
    payload = PAYLOADS[type_name]
    assert stem_text(type_name, payload) is None
    assert canonical_answer(type_name, payload) is None
    assert brick_fingerprint(type_name, payload) is None


def test_the_fingerprint_ignores_the_case_the_accents_and_the_spacing() -> None:
    payload = copy.deepcopy(PAYLOADS["choice_question"])
    original = brick_fingerprint("choice_question", payload)
    payload["stem"] = f"  {payload['stem'].upper()}  "
    payload["options"][0]["text"] = f" {payload['options'][0]['text'].upper()} "
    assert brick_fingerprint("choice_question", payload) == original


def test_one_changed_answer_changes_the_fingerprint() -> None:
    payload = copy.deepcopy(PAYLOADS["choice_question"])
    original = brick_fingerprint("choice_question", payload)
    payload["options"][0]["text"] = "Un tout autre compte"
    assert brick_fingerprint("choice_question", payload) != original


def test_the_cloze_orders_its_gaps_by_identifier() -> None:
    payload = copy.deepcopy(PAYLOADS["cloze"])
    reversed_payload = copy.deepcopy(payload)
    reversed_payload["gaps"] = list(reversed(reversed_payload["gaps"]))
    assert brick_fingerprint("cloze", reversed_payload) == brick_fingerprint("cloze", payload)


def test_the_categorization_answer_uses_the_normalized_category_labels() -> None:
    payload = PAYLOADS["categorization"]
    answer = canonical_answer("categorization", payload)
    assert answer is not None
    for category in payload["categories"]:
        assert normalize_text(category["label"]) in answer


def test_the_ordering_answer_keeps_the_authored_order() -> None:
    payload = PAYLOADS["ordering"]
    answer = canonical_answer("ordering", payload)
    assert answer == "|".join(normalize_text(item["text"]) for item in payload["items"])
