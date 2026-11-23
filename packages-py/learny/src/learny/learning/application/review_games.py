"""Bridge between the review game contracts and the brick grading (SPEC-702 ET-1, ET-2).

Port of `packages/domain/src/review/game-response.ts` and `packages/services/src/review/per-notion.ts`.
The contract speaks arrays of pairs/assignments/gaps, `grade_brick` speaks records keyed by the
opaque ids of the public payload, and `brick_format_response` maps the second to the first. Pure:
no clock, no database, no model call.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.domain.bricks.public import opaque_mapping


def brick_format_response(type_name: str, response: Any) -> Any:
    """ET-1 - contract response to the response schema of the brick (records of opaque ids)."""
    if not isinstance(response, Mapping):
        return response
    if type_name == "matching":
        pairs = response.get("pairs")
        return {
            "pairs": {
                str(pair["leftId"]): str(pair["rightId"])
                for pair in (pairs if isinstance(pairs, list) else [])
            }
        }
    if type_name == "ordering":
        return {"order": list(response.get("order") or [])}
    if type_name == "categorization":
        assignments = response.get("assignments")
        return {
            "assignments": {
                str(assignment["itemId"]): str(assignment["categoryId"])
                for assignment in (assignments if isinstance(assignments, list) else [])
            }
        }
    if type_name == "cloze":
        gaps = response.get("gaps")
        return {
            "gaps": {
                str(gap["gapId"]): str(gap.get("value") or "")
                for gap in (gaps if isinstance(gaps, list) else [])
            }
        }
    return response


def to_game_correction(
    type_name: str, payload: Mapping[str, Any], outcome: Mapping[str, Any], seed: str
) -> dict[str, Any]:
    """ET-2 - the brick correction view to the contract correction of the four games."""
    correction = outcome["correction"]
    if type_name == "matching":
        right_id_by_text = {str(right["text"]): str(right["id"]) for right in opaque_mapping(payload, seed)}
        pairs = []
        for pair in correction.get("pairs") or []:
            given = pair.get("givenRight")
            pairs.append(
                {
                    "leftId": str(pair["pairId"]),
                    "rightId": None if given is None else right_id_by_text.get(str(given)),
                    "ok": bool(pair["correct"]),
                    "expectedRightId": right_id_by_text.get(str(pair["expectedRight"]), ""),
                    "expectedLeftLabel": str(pair["left"]),
                }
            )
        return {"kind": "matching", "pairs": pairs}
    if type_name == "ordering":
        rows = [
            {
                "stepId": str(position["id"]),
                "position": int(position["givenIndex"]) + 1,
                "ok": bool(position["correct"]),
                "expectedPosition": int(position["expectedIndex"]) + 1,
            }
            for position in correction.get("positions") or []
        ]
        return {"kind": "ordering", "rows": rows}
    if type_name == "categorization":
        rows = [
            {
                "itemId": str(item["id"]),
                "categoryId": item.get("givenCategoryId"),
                "ok": bool(item["correct"]),
                "expectedCategoryId": str(item["expectedCategoryId"]),
                "expectedCategoryLabel": str(item["expectedCategoryLabel"]),
            }
            for item in correction.get("items") or []
        ]
        return {"kind": "categorization", "rows": rows}
    gaps = [
        {
            "gapId": str(gap["id"]),
            "ok": bool(gap["correct"]),
            "expected": str(gap["expected"]),
            "given": str(gap.get("given") or ""),
        }
        for gap in correction.get("gaps") or []
    ]
    return {"kind": "cloze", "gaps": gaps}


def correction_explanation(outcome: Mapping[str, Any]) -> str | None:
    """ET-2 - the explanation attached to a correction (a string for the four games)."""
    correction = outcome.get("correction")
    if not isinstance(correction, Mapping):
        return None
    explanation = correction.get("explanation")
    return explanation if isinstance(explanation, str) else None


def _ordered_notions(primary: Sequence[str], extra: Sequence[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for notion_id in [*primary, *extra]:
        if notion_id in seen:
            continue
        seen.add(notion_id)
        result.append(notion_id)
    return result


def _confusion_of(confusions: Sequence[Mapping[str, str]] | None, notion_id: str) -> str | None:
    for confusion in confusions or []:
        if confusion["notionId"] == notion_id:
            return confusion["confusedWithNotionId"]
    return None


def _split_whole_item(context: Mapping[str, Any]) -> list[dict[str, Any]]:
    return [
        {"notionId": str(notion_id), "correct": bool(context["isCorrect"])}
        for notion_id in context["notionIds"]
    ]


def _split_matching(
    payload: Mapping[str, Any],
    correction: Mapping[str, Any],
    context: Mapping[str, Any],
) -> list[dict[str, Any]]:
    if correction.get("kind") != "matching":
        return _split_whole_item(context)
    ok_by_pair = {str(pair["leftId"]): bool(pair["ok"]) for pair in correction["pairs"]}
    pairs = list(payload.get("pairs") or [])
    pair_notions = [str(pair["notionId"]) for pair in pairs]
    results: list[dict[str, Any]] = []
    for notion_id in _ordered_notions(list(context["notionIds"]), pair_notions):
        own = [pair for pair in pairs if str(pair["notionId"]) == notion_id]
        correct = (
            bool(context["isCorrect"])
            if not own
            else all(ok_by_pair.get(str(pair["id"])) is True for pair in own)
        )
        entry: dict[str, Any] = {"notionId": notion_id, "correct": correct}
        confused = _confusion_of(context.get("confusions"), notion_id)
        if confused is not None:
            entry["confusedWithNotionId"] = confused
        results.append(entry)
    return results


def _split_categorization(
    payload: Mapping[str, Any],
    correction: Mapping[str, Any],
    context: Mapping[str, Any],
) -> list[dict[str, Any]]:
    if correction.get("kind") != "categorization":
        return _split_whole_item(context)
    categories = list(payload.get("categories") or [])
    category_notion = {str(category["id"]): category.get("notionId") for category in categories}
    ok_by_item = {str(row["itemId"]): bool(row["ok"]) for row in correction["rows"]}
    derived: list[dict[str, str]] = []
    for row in correction["rows"]:
        if row["ok"] or row.get("categoryId") is None:
            continue
        expected = category_notion.get(str(row["expectedCategoryId"]))
        given = category_notion.get(str(row["categoryId"]))
        if expected is not None and given is not None and expected != given:
            derived.append({"notionId": str(expected), "confusedWithNotionId": str(given)})
    confusions = context.get("confusions") or derived
    category_notions = [
        str(category["notionId"]) for category in categories if category.get("notionId") is not None
    ]
    items = list(payload.get("items") or [])
    results: list[dict[str, Any]] = []
    for notion_id in _ordered_notions(list(context["notionIds"]), category_notions):
        own = [item for item in items if category_notion.get(str(item["categoryId"])) == notion_id]
        correct = (
            bool(context["isCorrect"])
            if not own
            else all(ok_by_item.get(str(item["id"])) is True for item in own)
        )
        entry: dict[str, Any] = {"notionId": notion_id, "correct": correct}
        confused = _confusion_of(confusions, notion_id)
        if confused is not None:
            entry["confusedWithNotionId"] = confused
        results.append(entry)
    return results


def split_result_by_notion(
    type_name: str,
    payload: Mapping[str, Any],
    correction: Mapping[str, Any],
    context: Mapping[str, Any],
) -> list[dict[str, Any]]:
    """ET-4, ET-5 - splits one game into the FSRS outcomes of its notions."""
    if type_name == "matching":
        return _split_matching(payload, correction, context)
    if type_name == "categorization":
        return _split_categorization(payload, correction, context)
    return _split_whole_item(context)


__all__ = [
    "brick_format_response",
    "correction_explanation",
    "split_result_by_notion",
    "to_game_correction",
]
