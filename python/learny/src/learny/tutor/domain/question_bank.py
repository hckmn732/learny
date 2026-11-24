"""Pure rules of the personal question banks (SPEC-513 ET-1, BR-MEM-07, ADR-0026).

The four formats a bank can hold, the minimum number of distinct variants, the placeholder
substitution of a fixture, the distractors of a choice question, the batch bound and the job group.
No IO, no clock.
"""

import json
from collections.abc import Mapping, Sequence
from typing import Any

from learny.shared.locale_fr import tutor as texts

QUESTION_BANK_FORMATS: tuple[str, ...] = (
    "choice_question",
    "open_question",
    "cloze",
    "matching",
)
"""BR-MEM-07 - the formats a quiz and the memorisation games can draw from."""

QUESTION_BANK_MIN_VARIANTS = 4
"""BR-MEM-07 - at least four distinct variants per notion and format."""

QUESTION_BANK_MAX_VARIANTS = 20
MAX_NOTIONS_PER_MODULE = 20
MAX_DISTRACTORS = 5
QUESTION_BANK_PASSAGE_LIMIT = 8
QUESTION_BANK_MAX_ATTEMPTS = 3
"""SPEC-508 EF-4 - the initial call and its two corrections."""

DEFAULT_LIMIT = 20
MAX_LIMIT = 50
"""The nightly batch never drains more than fifty job rows."""

INVALID_OUTPUT = "INVALID_OUTPUT"
INCOMPLETE_BANK = "INCOMPLETE_BANK"
FAILED_STATUSES: tuple[str, ...] = ("queued", "failed")
PERMANENT_ERROR_CODES: tuple[str, ...] = (INVALID_OUTPUT, INCOMPLETE_BANK)

QUESTION_BANK_PROMPT_ID = "tutor.question-bank"
QUESTION_BANK_PROMPT_VERSION = 1
QUESTION_BANK_SCENARIO = "question-bank"
QUESTION_BANK_REGENERATION_SCENARIO = "question-bank-regeneration"


def clamp_limit(value: int | None) -> int:
    """`max(1, min(50, limit ?? 20))`: the nightly bound of one batch."""
    if value is None:
        return DEFAULT_LIMIT
    return max(1, min(MAX_LIMIT, value))


def scenario_for(reason: str, explicit: str | None) -> str:
    """The mock scenario of the generation; an explicit one always wins (ADR-0048)."""
    if explicit is not None:
        return explicit
    return QUESTION_BANK_REGENERATION_SCENARIO if reason == "exhaustion" else QUESTION_BANK_SCENARIO


def replace_placeholders(value: Any, notion_id: str) -> Any:
    """`replacePlaceholders`: substitutes `{{notionId}}` and `{{distractorNotionId}}`."""
    serialised = json.dumps(value, ensure_ascii=False)
    replaced = serialised.replace("{{notionId}}", notion_id).replace("{{distractorNotionId}}", notion_id)
    return json.loads(replaced)


def generation_query(notion: Mapping[str, Any]) -> str:
    """The embedding query of one notion: `label - short definition`."""
    parts = [str(notion["label"]), str(notion["short_definition"] or "")]
    return " \u2014 ".join(part for part in parts if part)


def location_of(raw: Any) -> dict[str, Any]:
    """The location of a passage, keeping only the documented keys."""
    value = json.loads(raw) if isinstance(raw, str) else raw
    record = value if isinstance(value, Mapping) else {}
    location: dict[str, Any] = {}
    if isinstance(record.get("page"), int):
        location["page"] = record["page"]
    if isinstance(record.get("startSec"), int):
        location["startSec"] = record["startSec"]
    if isinstance(record.get("endSec"), int):
        location["endSec"] = record["endSec"]
    if isinstance(record.get("anchor"), str):
        location["anchor"] = record["anchor"]
    location["charStart"] = record["charStart"] if isinstance(record.get("charStart"), int) else 0
    location["charEnd"] = record["charEnd"] if isinstance(record.get("charEnd"), int) else 0
    return location


def distractors_of(payload: Any, labels: Mapping[str, str]) -> list[dict[str, Any]]:
    """The wrong options of a choice question, with the notion label they confuse."""
    record = payload if isinstance(payload, Mapping) else {}
    options = record.get("options")
    if not isinstance(options, Sequence) or isinstance(options, (str, bytes)):
        return []
    found: list[dict[str, Any]] = []
    for raw in options:
        option = raw if isinstance(raw, Mapping) else {}
        if option.get("correct") is True or not isinstance(option.get("notionId"), str):
            continue
        found.append(
            {
                "notionId": option["notionId"],
                "label": labels.get(option["notionId"], texts.QUESTION_BANK_NOTION_FALLBACK),
                "rationale": option.get("rationale") if isinstance(option.get("rationale"), str) else None,
            }
        )
    return found[:MAX_DISTRACTORS]


def group_of(
    notion_id: str,
    format_name: str,
    count: int,
    available: int,
    inserted: int,
    duplicates: int,
) -> dict[str, Any]:
    """`groupOf`: one notion and format of the batch result."""
    return {
        "notionId": notion_id,
        "format": format_name,
        "required": count,
        "available": available,
        "inserted": inserted,
        "duplicates": duplicates,
        "complete": available >= count,
    }


__all__ = [
    "DEFAULT_LIMIT",
    "FAILED_STATUSES",
    "INCOMPLETE_BANK",
    "INVALID_OUTPUT",
    "MAX_DISTRACTORS",
    "MAX_LIMIT",
    "MAX_NOTIONS_PER_MODULE",
    "PERMANENT_ERROR_CODES",
    "QUESTION_BANK_FORMATS",
    "QUESTION_BANK_MAX_ATTEMPTS",
    "QUESTION_BANK_MAX_VARIANTS",
    "QUESTION_BANK_MIN_VARIANTS",
    "QUESTION_BANK_PASSAGE_LIMIT",
    "QUESTION_BANK_PROMPT_ID",
    "QUESTION_BANK_PROMPT_VERSION",
    "QUESTION_BANK_REGENERATION_SCENARIO",
    "QUESTION_BANK_SCENARIO",
    "clamp_limit",
    "distractors_of",
    "generation_query",
    "group_of",
    "location_of",
    "replace_placeholders",
    "scenario_for",
]
