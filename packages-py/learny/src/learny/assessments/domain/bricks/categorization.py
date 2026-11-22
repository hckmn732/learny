"""Code grading of a categorization (SPEC-502 ET-3, BR-MEM-05).

An item placed in the category of another notion becomes a confusion (CA-2); an unknown or
notion-less category only an error. Pure port of
`packages/bricks/src/types/categorization/grade.ts`.
"""

from collections.abc import Mapping
from typing import Any

from learny.assessments.domain.bricks.grade_support import (
    dedupe_confusions,
    invalid_response,
    outcome,
    round4,
)
from learny.assessments.domain.bricks.responses import read_object, read_record


def parse_categorization_response(payload: Mapping[str, Any], response: Any) -> dict[str, Any]:
    """Validates a categorization response; raises `BrickGradeError` otherwise."""
    parsed = read_object(response, ("assignments",))
    assignments = read_record(
        parsed["assignments"], "response.assignments", value_max_length=None, nullable=True
    )
    expected = {str(item["id"]) for item in payload["items"]}
    categories = {str(category["id"]) for category in payload["categories"]}
    given = set(assignments)
    issues: list[dict[str, str]] = []
    for item_id in expected:
        if item_id not in given:
            issues.append(
                {
                    "path": f"response.assignments.{item_id}",
                    "message": f'Missing item "{item_id}".',
                }
            )
    for item_id in given:
        if item_id not in expected:
            issues.append(
                {
                    "path": f"response.assignments.{item_id}",
                    "message": f'Unknown item "{item_id}".',
                }
            )
    for item_id, category_id in assignments.items():
        if category_id is not None and category_id not in categories:
            issues.append(
                {
                    "path": f"response.assignments.{item_id}",
                    "message": f'Unknown category "{category_id}".',
                }
            )
    if issues:
        raise invalid_response(issues)
    return {"assignments": assignments}


def grade_categorization(payload: Mapping[str, Any], response: Any) -> dict[str, Any]:
    """Grades one categorization response; raises `BrickGradeError` on an invalid response."""
    parsed = parse_categorization_response(payload, response)
    categories = {str(category["id"]): category for category in payload["categories"]}
    confusions: list[dict[str, str]] = []
    results: list[dict[str, Any]] = []
    for item in payload["items"]:
        given_category_id = parsed["assignments"].get(str(item["id"]))
        expected_category = categories.get(str(item["categoryId"]))
        given_category = None if given_category_id is None else categories.get(given_category_id)
        correct = given_category_id == item["categoryId"]
        if (
            not correct
            and expected_category is not None
            and given_category is not None
            and expected_category.get("notionId") is not None
            and given_category.get("notionId") is not None
            and expected_category["notionId"] != given_category["notionId"]
        ):
            confusions.append(
                {
                    "notionId": str(expected_category["notionId"]),
                    "confusedWithNotionId": str(given_category["notionId"]),
                }
            )
        results.append(
            {
                "item": item,
                "givenCategoryId": given_category_id,
                "expectedCategory": expected_category,
                "givenCategory": given_category,
                "correct": correct,
            }
        )
    correct_count = sum(1 for result in results if result["correct"])
    items = payload["items"]
    return outcome(
        is_correct=correct_count == len(items),
        score=round4(correct_count / len(items)),
        chosen_distractor_notion_id=None,
        confusions=dedupe_confusions(confusions),
        normalized_response="|".join(
            f"{result['item']['id']}={result['givenCategoryId'] or ''}" for result in results
        ),
        correction={
            "kind": "categorization",
            "explanation": payload["explanation"],
            "items": [
                {
                    "id": result["item"]["id"],
                    "text": result["item"]["text"],
                    "expectedCategoryId": result["item"]["categoryId"],
                    "expectedCategoryLabel": (
                        result["item"]["categoryId"]
                        if result["expectedCategory"] is None
                        else result["expectedCategory"]["label"]
                    ),
                    "givenCategoryId": result["givenCategoryId"],
                    "givenCategoryLabel": (
                        None if result["givenCategory"] is None else result["givenCategory"]["label"]
                    ),
                    "correct": result["correct"],
                }
                for result in results
            ],
        },
    )


__all__ = ["grade_categorization", "parse_categorization_response"]
