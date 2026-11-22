"""Public projection of a stored brick version (SPEC-501 EF-6, ADR-0150 section 3).

It is the only shape sent to the browser before correction. The seed is the version id, so the same
version always shuffles the same way and the server can recompute the opaque-id mapping.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.domain.bricks.public import project_public

BRICK_PUBLIC_REQUIRED_ABSENT_FIELDS = (
    "correct",
    "answers",
    "expectedElements",
    "modelAnswer",
    "categoryId",
    "hints",
)
"""Fields that must never appear in a public payload (CA-4), at any depth."""


def to_public_brick(
    *,
    brick_id: str,
    version_id: str,
    type_name: str,
    notion_ids: Sequence[str],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    """The public brick document of one stored version."""
    return {
        "brickId": brick_id,
        "versionId": version_id,
        "type": type_name,
        "notionIds": list(notion_ids),
        "publicPayload": project_public(type_name, payload, version_id),
    }


__all__ = ["BRICK_PUBLIC_REQUIRED_ABSENT_FIELDS", "to_public_brick"]
