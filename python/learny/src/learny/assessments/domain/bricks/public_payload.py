"""Public payload of every brick type (SPEC-501 ET-7, ADR-0150).

The public projection is the only shape sent to the browser before correction: no correct option,
answer list, expected element, model answer, category link, criterion description or hint. Each
type keeps the exact key order of `packages/bricks/src/types/<type>/public.ts`, and the deterministic
shuffles are seeded by the brick version id, so the server can always rebuild the opaque mapping.
"""

from collections.abc import Callable, Mapping
from typing import Any, cast

from learny.assessments.domain.bricks.random import shuffle_seeded


def _sources(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [dict(source) for source in payload["sources"]]


def text_public(payload: Mapping[str, Any]) -> dict[str, Any]:
    """A `text` brick: everything is safe to send to the browser."""
    public = dict(payload)
    public["sources"] = _sources(payload)
    return public


def resource_excerpt_public(payload: Mapping[str, Any]) -> dict[str, Any]:
    """A cited passage: everything is safe to send to the browser."""
    return {
        "resourceId": payload["resourceId"],
        "chunkId": payload["chunkId"],
        "location": dict(payload["location"]),
        "quote": payload["quote"],
        "label": payload["label"],
        "sources": _sources(payload),
    }


def choice_question_public(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Option texts only, in the authored order: no `correct`, no rationale, no objective."""
    return {
        "stem": payload["stem"],
        "mode": payload["mode"],
        "options": [{"id": option["id"], "text": option["text"]} for option in payload["options"]],
        "sources": _sources(payload),
    }


def open_question_public(payload: Mapping[str, Any]) -> dict[str, Any]:
    """The expected elements and the model answer stay server-side."""
    return {
        "stem": payload["stem"],
        "answerMaxChars": payload["answerMaxChars"],
        "criteria": [
            {"label": criterion["label"], "points": criterion["points"]} for criterion in payload["criteria"]
        ],
        "sources": _sources(payload),
    }


def cloze_public(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Only the hint of each gap; accepted answers stay server-side."""
    gaps: list[dict[str, Any]] = []
    for gap in payload["gaps"]:
        gaps.append({"id": gap["id"]} if gap.get("hint") is None else {"id": gap["id"], "hint": gap["hint"]})
    return {
        "template": payload["template"],
        "gaps": gaps,
        "sources": _sources(payload),
    }


def opaque_mapping(payload: Mapping[str, Any], seed: str) -> list[dict[str, Any]]:
    """One opaque right and the pair it actually belongs to (`None` for an extra right)."""
    candidates: list[dict[str, Any]] = [
        {"text": pair["right"], "pairId": pair["id"]} for pair in payload["pairs"]
    ]
    candidates.extend({"text": text, "pairId": None} for text in payload.get("extraRights") or ())
    return [
        {"id": f"r{index + 1}", "text": candidate["text"], "pairId": candidate["pairId"]}
        for index, candidate in enumerate(shuffle_seeded(candidates, f"{seed}:rights"))
    ]


def matching_public(payload: Mapping[str, Any], seed: str) -> dict[str, Any]:
    """Lefts keep their pair id and order; rights are shuffled and renamed `r1..rn`."""
    return {
        "instruction": payload["instruction"],
        "lefts": [{"id": pair["id"], "text": pair["left"]} for pair in payload["pairs"]],
        "rights": [{"id": right["id"], "text": right["text"]} for right in opaque_mapping(payload, seed)],
        "sources": _sources(payload),
    }


def ordering_public(payload: Mapping[str, Any], seed: str) -> dict[str, Any]:
    """Items are shuffled; if the shuffle gives the correct order back, one rotation breaks it."""
    original = [{"id": item["id"], "text": item["text"]} for item in payload["items"]]
    items = shuffle_seeded(original, f"{seed}:items")
    if len(items) > 1 and all(item["id"] == base["id"] for item, base in zip(items, original, strict=True)):
        items = [*items[1:], items[0]]
    return {
        "instruction": payload["instruction"],
        "items": items,
        "sources": _sources(payload),
    }


def categorization_public(payload: Mapping[str, Any], seed: str) -> dict[str, Any]:
    """Categories stay visible, items are shuffled and lose their `categoryId`."""
    return {
        "instruction": payload["instruction"],
        "categories": [
            {"id": category["id"], "label": category["label"]} for category in payload["categories"]
        ],
        "items": shuffle_seeded(
            [{"id": item["id"], "text": item["text"]} for item in payload["items"]],
            f"{seed}:items",
        ),
        "sources": _sources(payload),
    }


def recall_card_public(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Everything, including the back, because the learner self-assesses (ADR-0150 section 3)."""
    public: dict[str, Any] = {"front": payload["front"], "back": payload["back"]}
    if payload.get("sourceLabel") is not None:
        public["sourceLabel"] = payload["sourceLabel"]
    if payload.get("mnemonic") is not None:
        public["mnemonic"] = payload["mnemonic"]
    public["sources"] = _sources(payload)
    return public


def instruction_public(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Everything except the criteria descriptions and the hints, replaced by their count."""
    return {
        "title": payload["title"],
        "taskMd": payload["taskMd"],
        "data": list(payload["data"]),
        "deliverable": payload["deliverable"],
        "production": payload["production"],
        "explanationPrompt": payload["explanationPrompt"],
        "hintsCount": len(payload["hints"]),
        "criteria": [
            {
                "key": criterion["key"],
                "label": criterion["label"],
                "points": criterion["points"],
            }
            for criterion in payload["criteria"]
        ],
        "estimatedMinutes": payload["estimatedMinutes"],
        "passPoints": payload["passPoints"],
        "sources": _sources(payload),
    }


def scripted_dialogue_public(payload: Mapping[str, Any]) -> dict[str, Any]:
    """The exact fields scripted by the specification; end condition and criteria stay server-side."""
    return {
        "role": payload["role"],
        "context": payload["context"],
        "learnerGoal": payload["learnerGoal"],
        "openingLine": payload["openingLine"],
        "maxTurns": payload["maxTurns"],
    }


def timer_public(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Everything, including the listed brick ids and the warning point."""
    return {
        "durationSec": payload["durationSec"],
        "scope": payload["scope"],
        "itemBrickIds": list(payload["itemBrickIds"]),
        "warnAtSec": payload["warnAtSec"],
        "autoSubmit": payload["autoSubmit"],
        "sources": _sources(payload),
    }


def scoring_public(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Everything, including the weights (the learner sees the scoring scale)."""
    return {
        "total": payload["total"],
        "threshold": payload["threshold"],
        "mode": payload["mode"],
        "weights": [dict(weight) for weight in payload["weights"]],
        "display": payload["display"],
        "sources": _sources(payload),
    }


PublicProjection = Callable[[Mapping[str, Any]], dict[str, Any]]
SeededPublicProjection = Callable[[Mapping[str, Any], str], dict[str, Any]]

PUBLIC_PROJECTIONS: dict[str, PublicProjection | SeededPublicProjection] = {
    "text": text_public,
    "resource_excerpt": resource_excerpt_public,
    "choice_question": choice_question_public,
    "open_question": open_question_public,
    "cloze": cloze_public,
    "matching": matching_public,
    "ordering": ordering_public,
    "categorization": categorization_public,
    "recall_card": recall_card_public,
    "instruction": instruction_public,
    "scripted_dialogue": scripted_dialogue_public,
    "timer": timer_public,
    "scoring": scoring_public,
}
"""The public projection of each of the thirteen types; unseeded types ignore the seed."""


SEEDED_PUBLIC_TYPES = ("matching", "ordering", "categorization")
"""The three types whose public projection shuffles with the version id."""


def project_public(type_name: str, payload: Mapping[str, Any], seed: str) -> dict[str, Any]:
    """Public payload of one brick version; `INVALID_INPUT` on an unknown type."""
    projection = PUBLIC_PROJECTIONS.get(type_name)
    if projection is None:
        raise ValueError(f"unknown brick type: {type_name}")
    if type_name in SEEDED_PUBLIC_TYPES:
        return cast(SeededPublicProjection, projection)(payload, seed)
    return cast(PublicProjection, projection)(payload)


__all__ = [
    "PUBLIC_PROJECTIONS",
    "SEEDED_PUBLIC_TYPES",
    "categorization_public",
    "choice_question_public",
    "cloze_public",
    "instruction_public",
    "matching_public",
    "opaque_mapping",
    "open_question_public",
    "ordering_public",
    "project_public",
    "recall_card_public",
    "resource_excerpt_public",
    "scoring_public",
    "scripted_dialogue_public",
    "text_public",
    "timer_public",
]
