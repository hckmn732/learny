"""Registry of the thirteen brick types (SPEC-501 ET-1, BR-BRI-01).

`BRICK_TYPES` and the registry are the single contract used by the tutor (SPEC-508), the grading
(SPEC-502), the rendering (SPEC-503), the qualification (SPEC-506) and the banks (SPEC-513). A
missing entry does not pass the registry test: a new type requires code.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, cast

from learny.assessments.domain.bricks.checks import CHECKS
from learny.assessments.domain.bricks.fingerprint import canonical_answer, stem_text
from learny.assessments.domain.bricks.public_payload import (
    PUBLIC_PROJECTIONS,
    SEEDED_PUBLIC_TYPES,
    PublicProjection,
    SeededPublicProjection,
)
from learny.assessments.domain.bricks.references import REFERENCES
from learny.assessments.domain.bricks.schema import PARSERS
from learny.assessments.domain.bricks.types import AUTO_GRADED_TYPES, QUESTION_TYPES


@dataclass(frozen=True, slots=True)
class BrickDefinition:
    """Everything the contract needs to know about one brick type."""

    type: str
    is_question: bool
    requires_notion: bool
    graded_by: str
    cross_check: Callable[[Mapping[str, Any]], list[dict[str, str]]]
    references: Callable[[Mapping[str, Any]], dict[str, list[dict[str, str]]]]
    to_public: Callable[[Mapping[str, Any], str], dict[str, Any]]

    def canonical_answer(self, payload: Mapping[str, Any]) -> str | None:
        return canonical_answer(self.type, payload) if self.is_question else None

    def stem(self, payload: Mapping[str, Any]) -> str | None:
        return stem_text(self.type, payload) if self.is_question else None


GRADED_BY = {
    "text": "none",
    "resource_excerpt": "none",
    "choice_question": "code",
    "open_question": "tutor",
    "cloze": "code",
    "matching": "code",
    "ordering": "code",
    "categorization": "code",
    "recall_card": "code",
    "instruction": "tutor",
    "scripted_dialogue": "tutor",
    "timer": "code",
    "scoring": "none",
}
"""Who corrects each type (BR-BRI-08)."""

REQUIRES_NOTION = {
    "text": True,
    "resource_excerpt": True,
    "choice_question": True,
    "open_question": True,
    "cloze": True,
    "matching": True,
    "ordering": True,
    "categorization": True,
    "recall_card": True,
    "instruction": True,
    "scripted_dialogue": True,
    "timer": False,
    "scoring": False,
}
"""A pedagogical brick must be attached to at least one notion (ET-4)."""


def _projection(type_name: str) -> Callable[[Mapping[str, Any], str], dict[str, Any]]:
    projection = PUBLIC_PROJECTIONS[type_name]
    if type_name in SEEDED_PUBLIC_TYPES:

        def seeded(payload: Mapping[str, Any], seed: str) -> dict[str, Any]:
            return cast(SeededPublicProjection, projection)(payload, seed)

        return seeded

    def plain(payload: Mapping[str, Any], _seed: str) -> dict[str, Any]:
        return cast(PublicProjection, projection)(payload)

    return plain


BRICK_REGISTRY: dict[str, BrickDefinition] = {
    type_name: BrickDefinition(
        type=type_name,
        is_question=type_name in QUESTION_TYPES,
        requires_notion=REQUIRES_NOTION[type_name],
        graded_by=GRADED_BY[type_name],
        cross_check=CHECKS[type_name],
        references=REFERENCES[type_name],
        to_public=_projection(type_name),
    )
    for type_name in PARSERS
}

assert set(BRICK_REGISTRY) == set(PARSERS), "every type needs a registry entry"
assert set(AUTO_GRADED_TYPES) <= set(BRICK_REGISTRY), "every auto-graded type is registered"


__all__ = ["BRICK_REGISTRY", "GRADED_BY", "REQUIRES_NOTION", "BrickDefinition"]
