"""Code grading of an ordering (SPEC-502 ET-3).

One point per item left in its expected position, with the expected and the given index of every
item in the correction.
"""

from collections.abc import Mapping
from typing import Any

from learny.assessments.domain.bricks.grade_support import invalid_response, outcome, round4
from learny.assessments.domain.bricks.responses import read_id_list, read_object


def parse_ordering_response(payload: Mapping[str, Any], response: Any) -> dict[str, Any]:
    """Validates an ordering response against the payload; raises `BrickGradeError` otherwise."""
    parsed = read_object(response, ("order",))
    order = read_id_list(
        parsed["order"],
        "response.order",
        minimum=1,
        maximum=10,
        unique_message="Ordered ids must be unique.",
    )
    expected = [str(item["id"]) for item in payload["items"]]
    expected_set = set(expected)
    issues: list[dict[str, str]] = []
    if len(order) != len(expected):
        issues.append(
            {
                "path": "response.order",
                "message": f"The order must contain exactly {len(expected)} items.",
            }
        )
    for index, item_id in enumerate(order):
        if item_id not in expected_set:
            issues.append({"path": f"response.order.{index}", "message": f'Unknown item "{item_id}".'})
    for item_id in expected:
        if item_id not in order:
            issues.append({"path": "response.order", "message": f'Missing item "{item_id}".'})
    if issues:
        raise invalid_response(issues)
    return {"order": order}


def grade_ordering(payload: Mapping[str, Any], response: Any) -> dict[str, Any]:
    """Grades one ordering response; raises `BrickGradeError` on an invalid response."""
    parsed = parse_ordering_response(payload, response)
    order: list[str] = parsed["order"]
    positions: list[dict[str, Any]] = []
    for expected_index, item in enumerate(payload["items"]):
        item_id = str(item["id"])
        given_index = order.index(item_id)
        positions.append(
            {
                "id": item["id"],
                "text": item["text"],
                "expectedIndex": expected_index,
                "givenIndex": given_index,
                "correct": given_index == expected_index,
            }
        )
    correct_count = sum(1 for position in positions if position["correct"])
    items = payload["items"]
    return outcome(
        is_correct=correct_count == len(items),
        score=round4(correct_count / len(items)),
        chosen_distractor_notion_id=None,
        confusions=[],
        normalized_response="|".join(order),
        correction={
            "kind": "ordering",
            "explanation": payload["explanation"],
            "positions": positions,
        },
    )


__all__ = ["grade_ordering", "parse_ordering_response"]
