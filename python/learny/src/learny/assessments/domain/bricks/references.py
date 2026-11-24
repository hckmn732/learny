"""References of a payload, grouped by resolver method (SPEC-501 ET-5).

Each entry keeps the exact JSON path, so NOTION_NOT_FOUND, SOURCE_NOT_FOUND and BRICK_REF_NOT_FOUND
point at the offending field.
"""

from collections.abc import Mapping, Sequence
from typing import Any


def empty_refs() -> dict[str, list[dict[str, str]]]:
    """The four reference namespaces of a payload."""
    return {"notions": [], "chunks": [], "resources": [], "bricks": []}


def with_sources(
    refs: dict[str, list[dict[str, str]]], sources: Sequence[Mapping[str, Any]]
) -> dict[str, list[dict[str, str]]]:
    """Adds one chunk reference per source, at its own payload path."""
    for index, source in enumerate(sources):
        refs["chunks"].append({"id": str(source["chunkId"]), "path": f"payload.sources.{index}.chunkId"})
    return refs


def text_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    return with_sources(empty_refs(), payload["sources"])


def resource_excerpt_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    refs = with_sources(empty_refs(), payload["sources"])
    if payload["chunkId"] is not None:
        refs["chunks"].append({"id": str(payload["chunkId"]), "path": "payload.chunkId"})
    refs["resources"].append({"id": str(payload["resourceId"]), "path": "payload.resourceId"})
    return refs


def choice_question_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    refs = with_sources(empty_refs(), payload["sources"])
    for index, option in enumerate(payload["options"]):
        if option["notionId"] is not None:
            refs["notions"].append(
                {"id": str(option["notionId"]), "path": f"payload.options.{index}.notionId"}
            )
    return refs


def open_question_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    return with_sources(empty_refs(), payload["sources"])


def cloze_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    return with_sources(empty_refs(), payload["sources"])


def matching_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    refs = with_sources(empty_refs(), payload["sources"])
    for index, pair in enumerate(payload["pairs"]):
        refs["notions"].append({"id": str(pair["notionId"]), "path": f"payload.pairs.{index}.notionId"})
    return refs


def ordering_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    return with_sources(empty_refs(), payload["sources"])


def categorization_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    refs = with_sources(empty_refs(), payload["sources"])
    for index, category in enumerate(payload["categories"]):
        if category["notionId"] is not None:
            refs["notions"].append(
                {"id": str(category["notionId"]), "path": f"payload.categories.{index}.notionId"}
            )
    return refs


def recall_card_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    return with_sources(empty_refs(), payload["sources"])


def instruction_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    return with_sources(empty_refs(), payload["sources"])


def scripted_dialogue_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    return with_sources(empty_refs(), payload["sources"])


def timer_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    refs = with_sources(empty_refs(), payload["sources"])
    for index, brick_id in enumerate(payload["itemBrickIds"]):
        refs["bricks"].append({"id": str(brick_id), "path": f"payload.itemBrickIds.{index}"})
    return refs


def scoring_references(payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    refs = with_sources(empty_refs(), payload["sources"])
    for index, weight in enumerate(payload["weights"]):
        refs["bricks"].append({"id": str(weight["brickId"]), "path": f"payload.weights.{index}.brickId"})
    return refs


REFERENCES = {
    "text": text_references,
    "resource_excerpt": resource_excerpt_references,
    "choice_question": choice_question_references,
    "open_question": open_question_references,
    "cloze": cloze_references,
    "matching": matching_references,
    "ordering": ordering_references,
    "categorization": categorization_references,
    "recall_card": recall_card_references,
    "instruction": instruction_references,
    "scripted_dialogue": scripted_dialogue_references,
    "timer": timer_references,
    "scoring": scoring_references,
}
"""The reference collector of each of the thirteen types."""


def collect_references(type_name: str, payload: Mapping[str, Any]) -> dict[str, list[dict[str, str]]]:
    """Every reference of a parsed payload."""
    collector = REFERENCES.get(type_name)
    if collector is None:
        raise ValueError(f"unknown brick type: {type_name}")
    return collector(payload)


__all__ = ["REFERENCES", "collect_references", "empty_refs", "with_sources"]
