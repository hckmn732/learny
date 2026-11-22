"""Fingerprint of the seven question types (SPEC-501 ET-6, BR-BRI-07, ADR-0151).

SHA-256 of the normalized stem, a unit separator and the normalized canonical answer. Non-question
bricks have no fingerprint. Pure: the payload is read, never written.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.domain.bricks.normalize import normalize_text
from learny.assessments.domain.bricks.sha256 import sha256_hex
from learny.shared.prng import utf16_key

SEPARATOR = "\u241f"
"""Unit separator between the stem and the canonical answer."""


def _sorted(values: Sequence[str]) -> str:
    """`[...values].sort().join('|')`, the sort being the JavaScript one (UTF-16 code units)."""
    return "|".join(sorted(values, key=utf16_key))


def canonical_answer(type_name: str, payload: Mapping[str, Any]) -> str | None:
    """Canonical answer of a question type, or `None` for a non-question brick (ET-6)."""
    if type_name == "choice_question":
        return _sorted(
            [
                normalize_text(str(option["text"]))
                for option in payload["options"]
                if option["correct"] is True
            ]
        )
    if type_name == "open_question":
        return _sorted([normalize_text(str(element)) for element in payload["expectedElements"]])
    if type_name == "cloze":
        gaps = sorted(payload["gaps"], key=lambda gap: int(gap["id"]))
        return "|".join(normalize_text(str(gap["answers"][0])) if gap["answers"] else "" for gap in gaps)
    if type_name == "matching":
        return _sorted(
            [
                f"{normalize_text(str(pair['left']))}=>{normalize_text(str(pair['right']))}"
                for pair in payload["pairs"]
            ]
        )
    if type_name == "ordering":
        return "|".join(normalize_text(str(item["text"])) for item in payload["items"])
    if type_name == "categorization":
        labels = {
            str(category["id"]): normalize_text(str(category["label"])) for category in payload["categories"]
        }
        return _sorted(
            [
                f"{normalize_text(str(item['text']))}=>{labels.get(str(item['categoryId']), '')}"
                for item in payload["items"]
            ]
        )
    if type_name == "recall_card":
        return normalize_text(str(payload["back"]))
    return None


def stem_text(type_name: str, payload: Mapping[str, Any]) -> str | None:
    """Normalized stem of a question type, or `None` for a non-question brick (ET-6)."""
    if type_name in ("choice_question", "open_question"):
        return normalize_text(str(payload["stem"]))
    if type_name == "cloze":
        return normalize_text(str(payload["template"]))
    if type_name == "matching":
        instruction = normalize_text(str(payload["instruction"]))
        lefts = _sorted([normalize_text(str(pair["left"])) for pair in payload["pairs"]])
        return f"{instruction}|{lefts}"
    if type_name == "ordering":
        instruction = normalize_text(str(payload["instruction"]))
        texts = _sorted([normalize_text(str(item["text"])) for item in payload["items"]])
        return f"{instruction}|{texts}"
    if type_name == "categorization":
        instruction = normalize_text(str(payload["instruction"]))
        texts = _sorted([normalize_text(str(item["text"])) for item in payload["items"]])
        return f"{instruction}|{texts}"
    if type_name == "recall_card":
        return normalize_text(str(payload["front"]))
    return None


def brick_fingerprint(type_name: str, payload: Mapping[str, Any]) -> str | None:
    """Lower-case hexadecimal SHA-256 of a question, or `None` for a non-question brick."""
    stem = stem_text(type_name, payload)
    answer = canonical_answer(type_name, payload)
    if stem is None or answer is None:
        return None
    return sha256_hex(f"{stem}{SEPARATOR}{answer}")


__all__ = ["SEPARATOR", "brick_fingerprint", "canonical_answer", "stem_text"]
