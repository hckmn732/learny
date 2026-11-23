"""Internal rules of the thirteen brick types (SPEC-501 ET-4).

Same codes, same JSON paths and the same English messages, because the tutor loop sends them back to
a model (BR-IA-11). No IO and no framework import.
"""

import re
from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.domain.bricks.issues import brick_issue
from learny.assessments.domain.bricks.normalize import normalize_text

RAW_HTML_TAG = re.compile(r"<[a-z]", re.IGNORECASE)
CLOZE_TOKEN = re.compile(r"\{\{(\d+)\}\}")


def duplicate_texts(entries: Sequence[Mapping[str, str]], code: str, label: str) -> list[dict[str, str]]:
    """Duplicate texts after ADR-0151 normalization, with the path of the first occurrence."""
    seen: dict[str, str] = {}
    issues: list[dict[str, str]] = []
    for entry in entries:
        key = normalize_text(entry["text"])
        first = seen.get(key)
        if first is None:
            seen[key] = entry["path"]
            continue
        issues.append(
            brick_issue(
                code,
                entry["path"],
                f'Duplicate {label} "{entry["text"]}" (same as {first}).',
            )
        )
    return issues


def duplicate_ids(entries: Sequence[Mapping[str, str]]) -> list[dict[str, str]]:
    """Duplicate identifiers in one namespace, with the path of the first occurrence."""
    seen: dict[str, str] = {}
    issues: list[dict[str, str]] = []
    for entry in entries:
        first = seen.get(entry["id"])
        if first is None:
            seen[entry["id"]] = entry["path"]
            continue
        issues.append(
            brick_issue(
                "DUPLICATE_ID",
                entry["path"],
                f'Duplicate id "{entry["id"]}" (same as {first}).',
            )
        )
    return issues


def points_sum(criteria: Sequence[Mapping[str, Any]]) -> float:
    """Sum of the points of the criteria."""
    return sum(float(criterion["points"]) for criterion in criteria)


def text_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    match = RAW_HTML_TAG.search(str(payload["bodyMd"]))
    if match is None:
        return []
    return [
        brick_issue(
            "HTML_NOT_ALLOWED",
            "payload.bodyMd",
            f'Raw HTML is not allowed in bodyMd (found "{match.group(0)}").',
        )
    ]


def resource_excerpt_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    return []


def choice_question_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    options = payload["options"]
    correct = [option for option in options if option["correct"]]
    if not correct:
        issues.append(
            brick_issue("CHOICE_NO_CORRECT", "payload.options", "At least one option must be correct.")
        )
    if payload["mode"] == "single" and len(correct) != 1:
        issues.append(
            brick_issue(
                "CHOICE_SINGLE_NEEDS_ONE",
                "payload.options",
                f"Single mode requires exactly one correct option (found {len(correct)}).",
            )
        )
    if len(correct) == len(options):
        issues.append(
            brick_issue("CHOICE_ALL_CORRECT", "payload.options", "At least one option must be wrong.")
        )
    for index, option in enumerate(options):
        if option["correct"] or option["notionId"] is not None:
            continue
        issues.append(
            brick_issue(
                "DISTRACTOR_NOTION_MISSING",
                f"payload.options.{index}.notionId",
                "Every wrong option must carry the notion it represents.",
            )
        )
    issues.extend(
        duplicate_texts(
            [
                {"text": option["text"], "path": f"payload.options.{index}.text"}
                for index, option in enumerate(options)
            ],
            "DUPLICATE_OPTION",
            "option text",
        )
    )
    issues.extend(
        duplicate_ids(
            [
                {"id": option["id"], "path": f"payload.options.{index}.id"}
                for index, option in enumerate(options)
            ]
        )
    )
    return issues


def open_question_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    total = points_sum(payload["criteria"])
    if 1 <= total <= 20:
        return []
    return [
        brick_issue(
            "CRITERIA_POINTS_MISMATCH",
            "payload.criteria",
            f"Criteria points must total between 1 and 20 (found {total:g}).",
        )
    ]


def _token_ids(template: str) -> list[int]:
    return [int(match.group(1)) for match in CLOZE_TOKEN.finditer(template)]


def cloze_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    gaps = payload["gaps"]
    tokens = _token_ids(str(payload["template"]))
    ids = [gap["id"] for gap in gaps]
    unique_tokens = set(tokens)
    expected = list(range(1, len(ids) + 1))
    ids_consecutive = ids == expected
    tokens_match = (
        len(unique_tokens) == len(tokens)
        and len(unique_tokens) == len(set(ids))
        and all(token in ids for token in unique_tokens)
    )
    if not ids_consecutive or not tokens_match:
        issues.append(
            brick_issue(
                "CLOZE_GAP_MISMATCH",
                "payload.template",
                "Template tokens must match the gap ids, with ids consecutive from 1 and no repeated token.",
            )
        )
    issues.extend(
        duplicate_ids(
            [{"id": str(gap["id"]), "path": f"payload.gaps.{index}.id"} for index, gap in enumerate(gaps)]
        )
    )
    outside = normalize_text(CLOZE_TOKEN.sub(" ", str(payload["template"])))
    haystack = f" {outside} "
    for index, gap in enumerate(gaps):
        answers = gap["answers"]
        first = str(answers[0]) if answers else ""
        answer = normalize_text(first)
        if answer == "":
            continue
        if f" {answer} " in haystack:
            issues.append(
                brick_issue(
                    "CLOZE_ANSWER_LEAK",
                    f"payload.gaps.{index}.answers.0",
                    f'Accepted answer "{first}" already appears outside the gaps.',
                )
            )
    return issues


def matching_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    pairs = payload["pairs"]
    entries: list[dict[str, str]] = []
    for index, pair in enumerate(pairs):
        entries.append({"text": pair["left"], "path": f"payload.pairs.{index}.left", "side": "left"})
        entries.append({"text": pair["right"], "path": f"payload.pairs.{index}.right", "side": "right"})
    for index, right in enumerate(payload["extraRights"]):
        entries.append({"text": right, "path": f"payload.extraRights.{index}", "side": "right"})
    lefts = [{"text": entry["text"], "path": entry["path"]} for entry in entries if entry["side"] == "left"]
    rights = [{"text": entry["text"], "path": entry["path"]} for entry in entries if entry["side"] == "right"]
    issues = duplicate_texts(lefts, "MATCHING_DUPLICATE", "left text")
    issues.extend(duplicate_texts(rights, "MATCHING_DUPLICATE", "right text"))
    issues.extend(
        duplicate_ids(
            [{"id": pair["id"], "path": f"payload.pairs.{index}.id"} for index, pair in enumerate(pairs)]
        )
    )
    return issues


def ordering_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    items = payload["items"]
    issues = duplicate_texts(
        [{"text": item["text"], "path": f"payload.items.{index}.text"} for index, item in enumerate(items)],
        "ORDERING_DUPLICATE",
        "item text",
    )
    issues.extend(
        duplicate_ids(
            [{"id": item["id"], "path": f"payload.items.{index}.id"} for index, item in enumerate(items)]
        )
    )
    return issues


def categorization_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    categories = payload["categories"]
    items = payload["items"]
    category_ids = {category["id"] for category in categories}
    for index, category in enumerate(categories):
        if not any(item["categoryId"] == category["id"] for item in items):
            issues.append(
                brick_issue(
                    "CATEGORY_EMPTY",
                    f"payload.categories.{index}",
                    f'Category "{category["label"]}" has no item.',
                )
            )
    for index, item in enumerate(items):
        if item["categoryId"] in category_ids:
            continue
        issues.append(
            brick_issue(
                "CATEGORY_UNKNOWN",
                f"payload.items.{index}.categoryId",
                f'Unknown category "{item["categoryId"]}".',
            )
        )
    issues.extend(
        duplicate_ids(
            [
                *(
                    {"id": category["id"], "path": f"payload.categories.{index}.id"}
                    for index, category in enumerate(categories)
                ),
                *(
                    {"id": item["id"], "path": f"payload.items.{index}.id"}
                    for index, item in enumerate(items)
                ),
            ]
        )
    )
    return issues


def recall_card_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    return []


def scripted_dialogue_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    total = points_sum(payload["criteria"])
    if 1 <= total <= 20:
        return []
    return [
        brick_issue(
            "CRITERIA_POINTS_MISMATCH",
            "payload.criteria",
            f"Criteria points must total between 1 and 20 (found {total:g}).",
        )
    ]


def timer_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    scope = payload["scope"]
    item_brick_ids = payload["itemBrickIds"]
    if scope == "items" and not item_brick_ids:
        return [
            brick_issue(
                "TIMER_SCOPE_INVALID",
                "payload.itemBrickIds",
                "Items scope requires at least one brick id.",
            )
        ]
    if scope == "activity" and item_brick_ids:
        return [
            brick_issue(
                "TIMER_SCOPE_INVALID",
                "payload.itemBrickIds",
                "Activity scope forbids item brick ids.",
            )
        ]
    return []


def scoring_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    if payload["mode"] != "weighted":
        return []
    weights = payload["weights"]
    total = sum(float(weight["points"]) for weight in weights)
    if weights and total == float(payload["total"]):
        return []
    return [
        brick_issue(
            "SCORING_SUM_MISMATCH",
            "payload.weights",
            f"Weighted scoring requires weights totaling {payload['total']} (found {total:g}).",
        )
    ]


def _option_issues(columns: Sequence[Mapping[str, Any]], base: str) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    for index, column in enumerate(columns):
        path = f"payload.production.{base}.{index}"
        options = column.get("options")
        if column["type"] == "select":
            if not options:
                issues.append(
                    brick_issue("TABLE_OPTIONS_INVALID", f"{path}.options", "A select column needs options.")
                )
        elif options is not None:
            issues.append(
                brick_issue(
                    "TABLE_OPTIONS_INVALID",
                    f"{path}.options",
                    "Options are only allowed on a select column.",
                )
            )
        if options is not None:
            values: set[str] = set()
            for option_index, option in enumerate(options):
                if option["value"] in values:
                    issues.append(
                        brick_issue(
                            "TABLE_OPTIONS_INVALID",
                            f"{path}.options.{option_index}.value",
                            f'Duplicate option value "{option["value"]}".',
                        )
                    )
                values.add(option["value"])
    return issues


def instruction_checks(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    criteria = payload["criteria"]
    total = points_sum(criteria)
    if total != 10:
        issues.append(
            brick_issue(
                "CRITERIA_POINTS_MISMATCH",
                "payload.criteria",
                f"Instruction criteria must total exactly 10 points (found {total:g}).",
            )
        )
    issues.extend(
        duplicate_ids(
            [
                {"id": criterion["key"], "path": f"payload.criteria.{index}.key"}
                for index, criterion in enumerate(criteria)
            ]
        )
    )
    production = payload["production"]
    if production["kind"] != "table":
        return issues
    fields = production["fields"]
    columns = production["columns"]
    issues.extend(
        duplicate_ids(
            [
                *(
                    {"id": column["key"], "path": f"payload.production.fields.{index}.key"}
                    for index, column in enumerate(fields)
                ),
                *(
                    {"id": column["key"], "path": f"payload.production.columns.{index}.key"}
                    for index, column in enumerate(columns)
                ),
            ]
        )
    )
    issues.extend(_option_issues(fields, "fields"))
    issues.extend(_option_issues(columns, "columns"))
    known = {column["key"]: column for column in columns}
    for index, check in enumerate(production["checks"]):
        number = known.get(check["numberColumn"])
        if number is None or number["type"] != "number":
            issues.append(
                brick_issue(
                    "TABLE_CHECK_COLUMN_UNKNOWN",
                    f"payload.production.checks.{index}.numberColumn",
                    f'Unknown number column "{check["numberColumn"]}" (a number column is required).',
                )
            )
        if check["groupColumn"] not in known:
            issues.append(
                brick_issue(
                    "TABLE_CHECK_COLUMN_UNKNOWN",
                    f"payload.production.checks.{index}.groupColumn",
                    f'Unknown group column "{check["groupColumn"]}".',
                )
            )
    return issues


CHECKS = {
    "text": text_checks,
    "resource_excerpt": resource_excerpt_checks,
    "choice_question": choice_question_checks,
    "open_question": open_question_checks,
    "cloze": cloze_checks,
    "matching": matching_checks,
    "ordering": ordering_checks,
    "categorization": categorization_checks,
    "recall_card": recall_card_checks,
    "instruction": instruction_checks,
    "scripted_dialogue": scripted_dialogue_checks,
    "timer": timer_checks,
    "scoring": scoring_checks,
}
"""The internal rules of each of the thirteen types."""


def cross_check(type_name: str, payload: Mapping[str, Any]) -> list[dict[str, str]]:
    """Every internal issue of a parsed payload."""
    check = CHECKS.get(type_name)
    if check is None:
        raise ValueError(f"unknown brick type: {type_name}")
    return check(payload)


__all__ = [
    "CHECKS",
    "categorization_checks",
    "choice_question_checks",
    "cloze_checks",
    "cross_check",
    "duplicate_ids",
    "duplicate_texts",
    "instruction_checks",
    "matching_checks",
    "open_question_checks",
    "ordering_checks",
    "points_sum",
    "recall_card_checks",
    "resource_excerpt_checks",
    "scoring_checks",
    "scripted_dialogue_checks",
    "text_checks",
    "timer_checks",
]
