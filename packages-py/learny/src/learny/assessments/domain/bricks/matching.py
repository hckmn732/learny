"""Code grading of a matching (SPEC-502 ET-3, BR-MEM-05).

Opaque ids are rebuilt with the version seed through `opaque_mapping`, the same function that built
the public payload. An error between two different notions becomes a confusion (CA-2); an extra
right or a null never does (CL-5). Pure port of `packages/bricks/src/types/matching/grade.ts`.
"""

from collections.abc import Mapping
from typing import Any

from learny.assessments.domain.bricks.grade_support import (
    dedupe_confusions,
    invalid_response,
    outcome,
    round4,
)
from learny.assessments.domain.bricks.normalize import normalize_text
from learny.assessments.domain.bricks.public import opaque_mapping
from learny.assessments.domain.bricks.responses import read_object, read_record


def parse_matching_response(payload: Mapping[str, Any], response: Any, seed: str) -> dict[str, Any]:
    """Validates a matching response against the payload; raises `BrickGradeError` otherwise."""
    parsed = read_object(response, ("pairs",))
    pairs = read_record(parsed["pairs"], "response.pairs", value_max_length=None, nullable=True)
    expected = {str(pair["id"]) for pair in payload["pairs"]}
    given = set(pairs)
    right_ids = {str(right["id"]) for right in opaque_mapping(payload, seed)}
    issues: list[dict[str, str]] = []
    for pair_id in expected:
        if pair_id not in given:
            issues.append({"path": f"response.pairs.{pair_id}", "message": f'Missing pair "{pair_id}".'})
    for pair_id in given:
        if pair_id not in expected:
            issues.append({"path": f"response.pairs.{pair_id}", "message": f'Unknown pair "{pair_id}".'})
    for pair_id, right_id in pairs.items():
        if right_id is not None and right_id not in right_ids:
            issues.append(
                {
                    "path": f"response.pairs.{pair_id}",
                    "message": f'Unknown right "{right_id}".',
                }
            )
    if issues:
        raise invalid_response(issues)
    return {"pairs": pairs}


def grade_matching(payload: Mapping[str, Any], response: Any, seed: str) -> dict[str, Any]:
    """Grades one matching response; raises `BrickGradeError` on an invalid response."""
    parsed = parse_matching_response(payload, response, seed)
    rights = opaque_mapping(payload, seed)
    right_by_id = {str(right["id"]): right for right in rights}
    pair_by_id = {str(pair["id"]): pair for pair in payload["pairs"]}
    confusions: list[dict[str, str]] = []
    results: list[dict[str, Any]] = []
    for pair in payload["pairs"]:
        given_right_id = parsed["pairs"].get(str(pair["id"]))
        given_right = None if given_right_id is None else right_by_id.get(given_right_id)
        correct = given_right is not None and given_right["pairId"] == pair["id"]
        if not correct and given_right is not None and given_right["pairId"] is not None:
            target = pair_by_id.get(str(given_right["pairId"]))
            if target is not None and target["notionId"] != pair["notionId"]:
                confusions.append(
                    {
                        "notionId": str(pair["notionId"]),
                        "confusedWithNotionId": str(target["notionId"]),
                    }
                )
        results.append({"pair": pair, "givenRight": given_right, "correct": correct})
    correct_count = sum(1 for result in results if result["correct"])
    pairs = payload["pairs"]
    return outcome(
        is_correct=correct_count == len(pairs),
        score=round4(correct_count / len(pairs)),
        chosen_distractor_notion_id=None,
        confusions=dedupe_confusions(confusions),
        normalized_response="|".join(
            "" if result["givenRight"] is None else normalize_text(str(result["givenRight"]["text"]))
            for result in results
        ),
        correction={
            "kind": "matching",
            "explanation": payload["explanation"],
            "pairs": [
                {
                    "pairId": result["pair"]["id"],
                    "left": result["pair"]["left"],
                    "expectedRight": result["pair"]["right"],
                    "givenRight": (None if result["givenRight"] is None else result["givenRight"]["text"]),
                    "correct": result["correct"],
                }
                for result in results
            ],
        },
    )


__all__ = ["grade_matching", "parse_matching_response"]
