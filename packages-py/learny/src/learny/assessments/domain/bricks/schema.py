"""Payload schemas of the thirteen brick types (SPEC-501 ET-2/ET-3).

Port of the Zod schemas of `packages/bricks/src/types/<type>/schema.ts`: same fields, same bounds,
same defaults, same trimming and same strictness. Every rejected payload produces `SCHEMA_INVALID`
issues with the same code and the same JSON path as the TypeScript validator; the message is
written here in English because a Zod message is an internal detail never shown to a learner
(ADR-2011).
"""

import copy
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from learny.assessments.domain.bricks.issues import brick_issue, unique_issues
from learny.assessments.domain.bricks.types import BRICK_ORIGINS, BRICK_PURPOSES, BRICK_TYPES

MISSING = object()
"""Sentinel of an absent optional field, distinct from an explicit `None`."""

UUID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)
CRITERION_KEY = re.compile(r"^[a-z0-9_]{1,32}$")
ITEM_ID = re.compile(r"^[a-z0-9]{1,8}$")
COLUMN_KEY = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
INSTRUCTION_MIME_TYPES = (
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
    "text/markdown",
)
MAX_SAFE_INTEGER = 9_007_199_254_740_991


class Invalid(Exception):
    """Internal control flow: one or more `SCHEMA_INVALID` issues."""

    def __init__(self, issues: Sequence[Mapping[str, str]]) -> None:
        super().__init__("invalid payload")
        self.issues: list[dict[str, str]] = [dict(issue) for issue in issues]


def _invalid(path: str, message: str) -> Invalid:
    return Invalid([brick_issue("SCHEMA_INVALID", path, message)])


@dataclass(frozen=True)
class Field:
    """One field of a strict object: its reader, its requirement and its default."""

    read: Callable[[Any, str], Any]
    required: bool = True
    default: Any = MISSING


def _string(minimum: int, maximum: int) -> Callable[[Any, str], str]:
    def read(value: Any, path: str) -> str:
        if not isinstance(value, str):
            raise _invalid(path, "A string is required.")
        if len(value) < minimum or len(value) > maximum:
            raise _invalid(path, f"A string of {minimum} to {maximum} characters is required.")
        return value

    return read


def _number(minimum: float | None = None, maximum: float | None = None) -> Callable[[Any, str], float]:
    def read(value: Any, path: str) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise _invalid(path, "A number is required.")
        number = float(value)
        if minimum is not None and number < minimum:
            raise _invalid(path, f"A number of at least {minimum:g} is required.")
        if maximum is not None and number > maximum:
            raise _invalid(path, f"A number of at most {maximum:g} is required.")
        return number

    return read


def _integer(minimum: int, maximum: int) -> Callable[[Any, str], int]:
    def read(value: Any, path: str) -> int:
        if isinstance(value, bool) or not isinstance(value, int):
            if isinstance(value, float) and float(value).is_integer():
                value = int(value)
            else:
                raise _invalid(path, "An integer is required.")
        if value < minimum or value > maximum:
            raise _invalid(path, f"An integer of {minimum} to {maximum} is required.")
        return int(value)

    return read


def _boolean(value: Any, path: str) -> bool:
    if not isinstance(value, bool):
        raise _invalid(path, "A boolean is required.")
    return value


def _enum(*allowed: str) -> Callable[[Any, str], str]:
    def read(value: Any, path: str) -> str:
        if not isinstance(value, str) or value not in allowed:
            raise _invalid(path, f"Expected one of {', '.join(allowed)}.")
        return value

    return read


def _literal(expected: str) -> Callable[[Any, str], str]:
    def read(value: Any, path: str) -> str:
        if value != expected:
            raise _invalid(path, f'Expected the literal "{expected}".')
        return expected

    return read


def _pattern(pattern: re.Pattern[str], label: str) -> Callable[[Any, str], str]:
    def read(value: Any, path: str) -> str:
        if not isinstance(value, str) or pattern.match(value) is None:
            raise _invalid(path, f"Invalid {label}.")
        return value

    return read


def _uuid(value: Any, path: str) -> str:
    if not isinstance(value, str) or UUID_PATTERN.match(value) is None:
        raise _invalid(path, "Invalid UUID.")
    return value


def _nullable(reader: Callable[[Any, str], Any]) -> Callable[[Any, str], Any]:
    def read(value: Any, path: str) -> Any:
        if value is None:
            return None
        return reader(value, path)

    return read


def _array(
    reader: Callable[[Any, str], Any],
    *,
    minimum: int = 0,
    maximum: int | None = None,
) -> Callable[[Any, str], list[Any]]:
    def read(value: Any, path: str) -> list[Any]:
        if not isinstance(value, list):
            raise _invalid(path, "An array is required.")
        if len(value) < minimum or (maximum is not None and len(value) > maximum):
            bound = f"{minimum} to {maximum}" if maximum is not None else f"at least {minimum}"
            raise _invalid(path, f"An array of {bound} items is required.")
        items: list[Any] = []
        issues: list[dict[str, str]] = []
        for index, item in enumerate(value):
            try:
                items.append(reader(item, f"{path}.{index}"))
            except Invalid as error:
                issues.extend(error.issues)
        if issues:
            raise Invalid(issues)
        return items

    return read


def _object(value: Any, path: str, spec: Mapping[str, Field]) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise _invalid(path, "An object is required.")
    result: dict[str, Any] = {}
    issues: list[dict[str, str]] = []
    for name, field in spec.items():
        at = name if path == "" else f"{path}.{name}"
        if name not in value:
            if field.default is not MISSING:
                result[name] = copy.deepcopy(field.default)
            elif field.required:
                issues.append(brick_issue("SCHEMA_INVALID", at, f'Missing field: "{name}".'))
            continue
        try:
            result[name] = field.read(value[name], at)
        except Invalid as error:
            issues.extend(error.issues)
    for key in value:
        if key in spec:
            continue
        at = key if path == "" else f"{path}.{key}"
        issues.append(brick_issue("SCHEMA_INVALID", at, f'Unrecognized key: "{key}".'))
    if issues:
        raise Invalid(issues)
    return result


def _with_issue(path: str, message: str) -> Invalid:
    return Invalid([brick_issue("SCHEMA_INVALID", path, message)])


def _object_reader(label: str, spec: Mapping[str, Field]) -> Callable[[Any, str], Any]:
    def read(value: Any, path: str) -> dict[str, Any]:
        return _object(value, path, spec)

    read.__name__ = f"read_{label}"
    return read


def _positive_number(value: Any, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _invalid(path, "A number is required.")
    if not float(value) > 0:
        raise _invalid(path, "A positive number is required.")
    return float(value)


def _refinements(failures: Sequence[tuple[str, str]]) -> None:
    if not failures:
        return
    raise Invalid([brick_issue("SCHEMA_INVALID", path, message) for path, message in failures])


SOURCE_REF = {
    "chunkId": Field(_uuid),
    "quote": Field(_string(1, 300), required=False),
}
SOURCES = Field(_array(_object_reader("source", SOURCE_REF), maximum=10), default=[])


HOME_LOCATION = {
    "page": Field(_integer(1, MAX_SAFE_INTEGER), required=False),
    "startSec": Field(_number(minimum=0), required=False),
    "endSec": Field(_number(minimum=0), required=False),
    "anchor": Field(_string(1, 200), required=False),
    "charStart": Field(_integer(0, MAX_SAFE_INTEGER), required=False),
    "charEnd": Field(_integer(0, MAX_SAFE_INTEGER), required=False),
}


def _read_location(value: Any, path: str) -> dict[str, Any]:
    location = _object(value, path, HOME_LOCATION)
    failures: list[tuple[str, str]] = []
    if not location:
        failures.append((path, "At least one location key is required."))
    start, end = location.get("startSec"), location.get("endSec")
    if start is not None and end is not None and end < start:
        failures.append((f"{path}.endSec", "endSec must be greater than or equal to startSec."))
    char_start, char_end = location.get("charStart"), location.get("charEnd")
    if char_start is not None and char_end is not None and char_end <= char_start:
        failures.append((f"{path}.charEnd", "charEnd must be greater than charStart."))
    _refinements(failures)
    return location


CHOICE_OPTION = {
    "id": Field(_pattern(ITEM_ID, "option id")),
    "text": Field(_string(1, 200)),
    "correct": Field(_boolean),
    "notionId": Field(_nullable(_uuid)),
    "rationale": Field(_string(1, 300), required=False),
}

OPEN_CRITERION = {
    "key": Field(_pattern(CRITERION_KEY, "criterion key")),
    "label": Field(_string(2, 120)),
    "points": Field(_integer(1, 10)),
    "description": Field(_string(0, 300)),
}

CLOZE_GAP = {
    "id": Field(_integer(1, 10)),
    "answers": Field(_array(_string(1, 60), minimum=1, maximum=10)),
    "hint": Field(_string(1, 60), required=False),
}

MATCHING_PAIR = {
    "id": Field(_pattern(ITEM_ID, "pair id")),
    "left": Field(_string(1, 120)),
    "right": Field(_string(1, 200)),
    "notionId": Field(_uuid),
}

ORDERING_ITEM = {
    "id": Field(_pattern(ITEM_ID, "item id")),
    "text": Field(_string(1, 160)),
}

CATEGORIZATION_CATEGORY = {
    "id": Field(_pattern(ITEM_ID, "category id")),
    "label": Field(_string(1, 60)),
    "notionId": Field(_nullable(_uuid)),
}

CATEGORIZATION_ITEM = {
    "id": Field(_pattern(ITEM_ID, "item id")),
    "text": Field(_string(1, 120)),
    "categoryId": Field(_pattern(ITEM_ID, "category id")),
}

RECALL_CARD = {
    "front": Field(_string(3, 300)),
    "back": Field(_string(1, 600)),
    "sourceLabel": Field(_string(1, 120), required=False),
    "mnemonic": Field(_string(1, 200), required=False),
}

INSTRUCTION_COLUMN = {
    "key": Field(_pattern(COLUMN_KEY, "column key")),
    "label": Field(_string(1, 60)),
    "type": Field(_enum("text", "number", "select")),
    "options": Field(
        _array(
            _object_reader(
                "column_option",
                {"value": Field(_string(1, 40)), "label": Field(_string(1, 80))},
            ),
            minimum=1,
            maximum=20,
        ),
        required=False,
    ),
}

INSTRUCTION_TABLE_CHECK = {
    "type": Field(_literal("sum_equal")),
    "numberColumn": Field(_pattern(COLUMN_KEY, "column key")),
    "groupColumn": Field(_pattern(COLUMN_KEY, "column key")),
    "left": Field(_array(_string(1, 80), minimum=1, maximum=10)),
    "right": Field(_array(_string(1, 80), minimum=1, maximum=10)),
    "leftLabel": Field(_string(1, 20), required=False),
    "rightLabel": Field(_string(1, 20), required=False),
    "sideColumnLabel": Field(_string(1, 20), required=False),
}

INSTRUCTION_CRITERION = {
    "key": Field(_pattern(CRITERION_KEY, "criterion key")),
    "label": Field(_string(2, 120)),
    "points": Field(_integer(1, 10)),
    "description": Field(_string(2, 400)),
}

DIALOGUE_CRITERION = {
    "key": Field(_pattern(CRITERION_KEY, "criterion key")),
    "label": Field(_string(2, 120)),
    "points": Field(_integer(1, 10)),
    "description": Field(_string(0, 300)),
}

TIMER = {
    "durationSec": Field(_integer(30, 14_400)),
    "scope": Field(_enum("activity", "items")),
    "itemBrickIds": Field(_array(_uuid, maximum=100), default=[]),
    "warnAtSec": Field(_integer(0, 14_400), required=False),
    "autoSubmit": Field(_boolean, default=True),
    "sources": SOURCES,
}

SCORING = {
    "total": Field(_integer(1, 100)),
    "threshold": Field(_number(minimum=0)),
    "mode": Field(_enum("equal", "weighted")),
    "weights": Field(
        _array(
            _object_reader(
                "scoring_weight",
                {"brickId": Field(_uuid), "points": Field(_positive_number)},
            ),
            maximum=100,
        ),
        default=[],
    ),
    "display": Field(_enum("percent", "points")),
    "sources": SOURCES,
}


def _read_production(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise _invalid(path, "An object is required.")
    kind = value.get("kind")
    if kind == "text":
        production = _object(value, path, _text_production_spec())
        if production["minChars"] > production["maxChars"]:
            raise _with_issue(f"{path}.minChars", "minChars must not exceed maxChars.")
        return production
    if kind == "file":
        return _object(value, path, _file_production_spec())
    if kind == "link":
        return _object(value, path, {"kind": Field(_literal("link"))})
    if kind == "table":
        production = _object(value, path, _table_production_spec())
        failures: list[tuple[str, str]] = []
        if production["maxRows"] < production["minRows"]:
            failures.append((f"{path}.maxRows", "maxRows must be greater than or equal to minRows."))
        if not production["minRows"] <= production["initialRows"] <= production["maxRows"]:
            failures.append((f"{path}.initialRows", "initialRows must be between minRows and maxRows."))
        _refinements(failures)
        return production
    raise _invalid(path, "Unknown production kind.")


def _text_production_spec() -> dict[str, Field]:
    return {
        "kind": Field(_literal("text")),
        "minChars": Field(_integer(0, 2000), default=0),
        "maxChars": Field(_integer(50, 10_000)),
    }


def _file_production_spec() -> dict[str, Field]:
    return {
        "kind": Field(_literal("file")),
        "accept": Field(_array(_enum(*INSTRUCTION_MIME_TYPES), minimum=1, maximum=6)),
        "maxSizeMb": Field(_integer(1, 50)),
    }


def _table_production_spec() -> dict[str, Field]:
    return {
        "kind": Field(_literal("table")),
        "fields": Field(_array(_object_reader("field", INSTRUCTION_COLUMN), maximum=4), default=[]),
        "columns": Field(_array(_object_reader("column", INSTRUCTION_COLUMN), minimum=1, maximum=8)),
        "minRows": Field(_integer(1, 20)),
        "maxRows": Field(_integer(1, 50)),
        "initialRows": Field(_integer(1, 50)),
        "checks": Field(
            _array(_object_reader("table_check", INSTRUCTION_TABLE_CHECK), maximum=3), default=[]
        ),
    }


def _read_timer(value: Any, path: str) -> dict[str, Any]:
    timer = _object(value, path, TIMER)
    warn_at, duration = timer.get("warnAtSec"), timer["durationSec"]
    if warn_at is not None and warn_at > duration:
        raise _with_issue(f"{path}.warnAtSec", "warnAtSec must not exceed durationSec.")
    timer["warnAtSec"] = min(300, duration) if warn_at is None else warn_at
    return timer


def _read_scoring(value: Any, path: str) -> dict[str, Any]:
    scoring = _object(value, path, SCORING)
    if scoring["threshold"] > scoring["total"]:
        raise _with_issue(f"{path}.threshold", "threshold must not exceed total.")
    return scoring


def _read_text(value: Any, path: str) -> dict[str, Any]:
    return _object(
        value,
        path,
        {
            "title": Field(_string(1, 120), required=False),
            "bodyMd": Field(_string(1, 20_000)),
            "sources": SOURCES,
        },
    )


def _read_resource_excerpt(value: Any, path: str) -> dict[str, Any]:
    return _object(
        value,
        path,
        {
            "resourceId": Field(_uuid),
            "chunkId": Field(_nullable(_uuid)),
            "location": Field(_read_location),
            "quote": Field(_string(1, 1000)),
            "label": Field(_string(1, 80)),
            "sources": SOURCES,
        },
    )


def _read_choice_question(value: Any, path: str) -> dict[str, Any]:
    return _object(
        value,
        path,
        {
            "stem": Field(_string(3, 600)),
            "mode": Field(_enum("single", "multiple")),
            "options": Field(_array(_object_reader("option", CHOICE_OPTION), minimum=2, maximum=6)),
            "explanation": Field(_string(10, 1200)),
            "objective": Field(_string(3, 200)),
            "sources": SOURCES,
        },
    )


def _read_open_question(value: Any, path: str) -> dict[str, Any]:
    return _object(
        value,
        path,
        {
            "stem": Field(_string(3, 600)),
            "expectedElements": Field(_array(_string(2, 200), minimum=1, maximum=8)),
            "criteria": Field(_array(_object_reader("criterion", OPEN_CRITERION), minimum=1, maximum=6)),
            "answerMaxChars": Field(_integer(50, 4000), default=1500),
            "modelAnswer": Field(_string(10, 2000)),
            "explanation": Field(_string(10, 1200)),
            "objective": Field(_string(3, 200)),
            "sources": SOURCES,
        },
    )


def _read_cloze(value: Any, path: str) -> dict[str, Any]:
    return _object(
        value,
        path,
        {
            "template": Field(_string(10, 1000)),
            "gaps": Field(_array(_object_reader("gap", CLOZE_GAP), minimum=1, maximum=10)),
            "explanation": Field(_string(10, 1200)),
            "sources": SOURCES,
        },
    )


def _read_matching(value: Any, path: str) -> dict[str, Any]:
    return _object(
        value,
        path,
        {
            "instruction": Field(_string(3, 300)),
            "pairs": Field(_array(_object_reader("pair", MATCHING_PAIR), minimum=2, maximum=8)),
            "extraRights": Field(_array(_string(1, 200), maximum=3), default=[]),
            "explanation": Field(_string(10, 1200)),
            "sources": SOURCES,
        },
    )


def _read_ordering(value: Any, path: str) -> dict[str, Any]:
    return _object(
        value,
        path,
        {
            "instruction": Field(_string(3, 300)),
            "items": Field(_array(_object_reader("item", ORDERING_ITEM), minimum=3, maximum=10)),
            "explanation": Field(_string(10, 1200)),
            "sources": SOURCES,
        },
    )


def _read_categorization(value: Any, path: str) -> dict[str, Any]:
    return _object(
        value,
        path,
        {
            "instruction": Field(_string(3, 300)),
            "categories": Field(
                _array(_object_reader("category", CATEGORIZATION_CATEGORY), minimum=2, maximum=4)
            ),
            "items": Field(_array(_object_reader("item", CATEGORIZATION_ITEM), minimum=4, maximum=12)),
            "explanation": Field(_string(10, 1200)),
            "sources": SOURCES,
        },
    )


def _read_recall_card(value: Any, path: str) -> dict[str, Any]:
    return _object(value, path, dict(RECALL_CARD, sources=SOURCES))


def _read_instruction(value: Any, path: str) -> dict[str, Any]:
    return _object(
        value,
        path,
        {
            "title": Field(_string(3, 120)),
            "taskMd": Field(_string(10, 4000)),
            "data": Field(_array(_string(1, 80), maximum=8), default=[]),
            "deliverable": Field(_string(3, 300)),
            "production": Field(_read_production),
            "explanationPrompt": Field(_nullable(_string(3, 300))),
            "hints": Field(_array(_string(5, 400), maximum=2), default=[]),
            "criteria": Field(
                _array(_object_reader("criterion", INSTRUCTION_CRITERION), minimum=1, maximum=8)
            ),
            "estimatedMinutes": Field(_integer(5, 120)),
            "passPoints": Field(_integer(1, 10), default=8),
            "sources": SOURCES,
        },
    )


def _read_scripted_dialogue(value: Any, path: str) -> dict[str, Any]:
    return _object(
        value,
        path,
        {
            "role": Field(_string(3, 120)),
            "context": Field(_string(10, 1500)),
            "learnerGoal": Field(_string(10, 400)),
            "endCondition": Field(_string(10, 300)),
            "openingLine": Field(_string(1, 600)),
            "maxTurns": Field(_integer(4, 30), default=12),
            "criteria": Field(_array(_object_reader("criterion", DIALOGUE_CRITERION), minimum=1, maximum=6)),
            "sources": SOURCES,
        },
    )


def _read_timer_reader(value: Any, path: str) -> dict[str, Any]:
    return _read_timer(value, path)


def _read_scoring_reader(value: Any, path: str) -> dict[str, Any]:
    return _read_scoring(value, path)


PARSERS: dict[str, Callable[[Any, str], dict[str, Any]]] = {
    "text": _read_text,
    "resource_excerpt": _read_resource_excerpt,
    "choice_question": _read_choice_question,
    "open_question": _read_open_question,
    "cloze": _read_cloze,
    "matching": _read_matching,
    "ordering": _read_ordering,
    "categorization": _read_categorization,
    "recall_card": _read_recall_card,
    "instruction": _read_instruction,
    "scripted_dialogue": _read_scripted_dialogue,
    "timer": _read_timer_reader,
    "scoring": _read_scoring_reader,
}
"""One strict payload reader per brick type."""

DRAFT = {
    "type": Field(_enum(*BRICK_TYPES)),
    "formationId": Field(_uuid),
    "purpose": Field(_enum(*BRICK_PURPOSES)),
    "notionIds": Field(_array(_uuid, maximum=10)),
    "origin": Field(_enum(*BRICK_ORIGINS)),
    "payload": Field(lambda value, _path: value),
}
"""The draft envelope submitted to `validate_brick` (ET-2): unknown fields are refused."""


def parse_payload(type_name: str, value: Any) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
    """Parses one payload with the schema of its type, without any cross-check."""
    reader = PARSERS.get(type_name)
    if reader is None:
        return None, [brick_issue("SCHEMA_INVALID", "type", f'Unknown brick type "{type_name}".')]
    try:
        return reader(value, "payload"), []
    except Invalid as error:
        return None, unique_issues(error.issues)


def parse_draft(value: Any) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
    """Parses the draft envelope; the paths of the issues are absolute (no prefix)."""
    try:
        return _object(value, "", DRAFT), []
    except Invalid as error:
        return None, unique_issues(error.issues)


__all__ = [
    "DRAFT",
    "INSTRUCTION_MIME_TYPES",
    "MAX_SAFE_INTEGER",
    "MISSING",
    "PARSERS",
    "Field",
    "Invalid",
    "parse_draft",
    "parse_payload",
]
