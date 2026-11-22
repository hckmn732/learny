"""Practice exercise rules (SPEC-613 EF-1 to EF-3, CL-1, CL-4, CL-5; BR-PRA-01).

Port of `packages/services/src/exercises/validate-production.ts` and
`packages/services/src/exercises/grade-exercise.ts`: the instruction invariants, the pure validation
of a production and the bounded correction. The deterministic tutor is the committed
`LLM_MODE=mock` fixture of the TypeScript service: a complete, well-explained production passes
every criterion, and a missing explanation loses its own criterion, never the others.

Everything here is pure: no IO, no clock, no model call. The structured-table control reuses the
live `sum_equal` evaluator of the brick domain instead of duplicating it (ADR-0027).
"""

import math
import re
import uuid
from collections.abc import Mapping
from typing import Any

from learny.assessments.domain.bricks.table_checks import evaluate_table_checks, parse_french_number
from learny.shared.locale_fr import assessments as texts

PRODUCTION_KINDS = ("text", "file", "link", "table")
"""`EXERCISE_PRODUCTION_KINDS` of the contract."""

COLUMN_TYPES = ("text", "number", "select")
"""`EXERCISE_COLUMN_TYPES` of the contract."""

MIME_TYPES = (
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
    "text/markdown",
)
"""`EXERCISE_MIME_TYPES` of the contract."""

MIN_EXPLANATION_CHARS = 10
"""`validateExplanation`: shorter than ten characters is refused before the tutor."""

VALID_EXPLANATION_CHARS = 20
"""`validExplanation`: the deterministic tutor requires at least twenty characters."""

EXPLANATION_PATTERN = re.compile(
    "d[\u00e9e]bit|cr[\u00e9e]dit|[\u00e9e]quilibr|partie double|compensation", re.IGNORECASE
)
"""`validExplanation`: the rule words the mock tutor looks for."""

EXPLANATION_CRITERION = re.compile("explication|explanation|d[\u00e9e]marche|demarche", re.IGNORECASE)
"""`isExplanationCriterion`: the criterion that carries the written explanation."""

SUBMISSION_KEYS: dict[str, frozenset[str]] = {
    "text": frozenset({"kind", "text", "explanation"}),
    "file": frozenset({"kind", "resourceId", "explanation"}),
    "link": frozenset({"kind", "url", "explanation"}),
    "table": frozenset({"kind", "fields", "rows", "explanation"}),
}
"""The strict key set of each submission variant (`ExerciseSubmissionSchema`)."""


def issue(path: str, message: str) -> dict[str, str]:
    """`issue` of `validate-production.ts`: one faulty path and its readable message."""
    return {"path": path, "message": message}


def is_uuid(value: Any) -> bool:
    """`z.uuid()` of the contract."""
    if not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def is_int(value: Any) -> bool:
    """`z.number().int()`: a finite whole number, booleans excluded."""
    return isinstance(value, int) and not isinstance(value, bool)


def is_number(value: Any) -> bool:
    """`z.number()`: a finite number, booleans excluded."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return math.isfinite(value)


def whole(value: Any) -> int | None:
    """An integer value, `None` when it is not a whole number (`z.number().int()`)."""
    return int(value) if is_int(value) else None


def is_text(value: Any, minimum: int, maximum: int) -> bool:
    """A bounded string."""
    return isinstance(value, str) and minimum <= len(value) <= maximum


def _mapping(value: Any) -> Mapping[str, Any] | None:
    return value if isinstance(value, Mapping) else None


def _list(value: Any) -> list[Any] | None:
    return list(value) if isinstance(value, list) else None


def column_of(value: Any) -> dict[str, Any] | None:
    """One typed column (or field) of a table production."""
    raw = _mapping(value)
    if raw is None:
        return None
    if not is_text(raw.get("key"), 1, 40) or not is_text(raw.get("label"), 1, 60):
        return None
    if raw.get("type") not in COLUMN_TYPES:
        return None
    options = raw.get("options")
    parsed_options: list[dict[str, str]] | None = None
    if options is not None:
        entries = _list(options)
        if entries is None or not 1 <= len(entries) <= 20:
            return None
        parsed_options = []
        for entry in entries:
            option = _mapping(entry)
            if option is None or set(option) - {"value", "label"}:
                return None
            if not is_text(option.get("value"), 1, 40) or not is_text(option.get("label"), 1, 80):
                return None
            parsed_options.append({"value": str(option["value"]), "label": str(option["label"])})
    parsed: dict[str, Any] = {
        "key": str(raw["key"]),
        "label": str(raw["label"]),
        "type": str(raw["type"]),
    }
    if parsed_options is not None:
        parsed["options"] = parsed_options
    return parsed


def check_of(value: Any) -> dict[str, Any] | None:
    """One `sum_equal` control of a table production."""
    raw = _mapping(value)
    if raw is None or raw.get("type") != "sum_equal":
        return None
    parsed: dict[str, Any] = {"type": "sum_equal"}
    for key, maximum in (("numberColumn", 40), ("groupColumn", 40)):
        if not is_text(raw.get(key), 1, maximum):
            return None
        parsed[key] = str(raw[key])
    for key in ("left", "right"):
        entries = _list(raw.get(key))
        if entries is None or not 1 <= len(entries) <= 10:
            return None
        values: list[str] = []
        for entry in entries:
            if not is_text(entry, 1, 80):
                return None
            values.append(str(entry))
        parsed[key] = values
    for key in ("leftLabel", "rightLabel", "sideColumnLabel"):
        label = raw.get(key)
        if label is not None:
            if not is_text(label, 1, 20):
                return None
            parsed[key] = str(label)
    return parsed


def production_of(value: Any) -> dict[str, Any] | None:
    """`ExerciseProductionSchema`: the discriminated union with its documented defaults."""
    raw = _mapping(value)
    if raw is None:
        return None
    kind = raw.get("kind")
    allowed = {
        "text": {"kind", "minChars", "maxChars"},
        "file": {"kind", "accept", "maxSizeMb"},
        "link": {"kind"},
        "table": {"kind", "fields", "columns", "minRows", "maxRows", "initialRows", "checks"},
    }
    if kind not in PRODUCTION_KINDS or set(raw) - allowed[str(kind)]:
        return None
    if kind == "text":
        minimum = whole(raw.get("minChars", 0))
        maximum = whole(raw.get("maxChars"))
        if minimum is None or not 0 <= minimum <= 2000:
            return None
        if maximum is None or not 50 <= maximum <= 10000 or minimum > maximum:
            return None
        return {"kind": "text", "minChars": minimum, "maxChars": maximum}
    if kind == "file":
        accept = _list(raw.get("accept"))
        size = whole(raw.get("maxSizeMb"))
        if accept is None or not 1 <= len(accept) <= 6:
            return None
        if any(entry not in MIME_TYPES for entry in accept):
            return None
        if size is None or not 1 <= size <= 50:
            return None
        return {"kind": "file", "accept": [str(entry) for entry in accept], "maxSizeMb": size}
    if kind == "link":
        return {"kind": "link"}
    fields_raw = _list(raw.get("fields", []))
    columns_raw = _list(raw.get("columns"))
    if fields_raw is None or columns_raw is None or len(fields_raw) > 4:
        return None
    if not 1 <= len(columns_raw) <= 8:
        return None
    fields = [column_of(entry) for entry in fields_raw]
    columns = [column_of(entry) for entry in columns_raw]
    if any(column is None for column in fields) or any(column is None for column in columns):
        return None
    checks_raw = _list(raw.get("checks", []))
    if checks_raw is None or len(checks_raw) > 3:
        return None
    checks = [check_of(entry) for entry in checks_raw]
    if any(check is None for check in checks):
        return None
    minimum_rows = whole(raw.get("minRows"))
    maximum_rows = whole(raw.get("maxRows"))
    initial_rows = whole(raw.get("initialRows"))
    if minimum_rows is None or not 1 <= minimum_rows <= 20:
        return None
    if maximum_rows is None or not 1 <= maximum_rows <= 50 or maximum_rows < minimum_rows:
        return None
    if initial_rows is None or not minimum_rows <= initial_rows <= maximum_rows:
        return None
    return {
        "kind": "table",
        "fields": [entry for entry in fields if entry is not None],
        "columns": [entry for entry in columns if entry is not None],
        "minRows": minimum_rows,
        "maxRows": maximum_rows,
        "initialRows": initial_rows,
        "checks": [entry for entry in checks if entry is not None],
    }


def criterion_of(value: Any) -> dict[str, Any] | None:
    """One criterion of the ten-point scale."""
    raw = _mapping(value)
    if raw is None or set(raw) - {"key", "label", "points", "description"}:
        return None
    if not is_text(raw.get("key"), 1, 40) or not is_text(raw.get("label"), 2, 120):
        return None
    points = whole(raw.get("points"))
    if points is None or not 1 <= points <= 10:
        return None
    if not is_text(raw.get("description"), 2, 400):
        return None
    return {
        "key": str(raw["key"]),
        "label": str(raw["label"]),
        "points": points,
        "description": str(raw["description"]),
    }


def parse_instruction(value: Any) -> dict[str, Any] | None:
    """`ExerciseInstructionSchema.parse`: the instruction with its defaults, `None` when invalid."""
    raw = _mapping(value)
    if raw is None or set(raw) - {
        "title",
        "taskMd",
        "data",
        "deliverable",
        "production",
        "explanationPrompt",
        "hints",
        "criteria",
        "estimatedMinutes",
        "passPoints",
        "sources",
    }:
        return None
    if not is_text(raw.get("title"), 3, 120) or not is_text(raw.get("taskMd"), 10, 4000):
        return None
    if not is_text(raw.get("deliverable"), 3, 300):
        return None
    data = _list(raw.get("data", []))
    if data is None or len(data) > 8 or any(not is_text(entry, 1, 80) for entry in data):
        return None
    production = production_of(raw.get("production"))
    if production is None:
        return None
    explanation = raw.get("explanationPrompt")
    if explanation is not None and not is_text(explanation, 3, 300):
        return None
    hints = _list(raw.get("hints", []))
    if hints is None or len(hints) > 2 or any(not is_text(entry, 5, 400) for entry in hints):
        return None
    criteria_raw = _list(raw.get("criteria"))
    if criteria_raw is None or not 1 <= len(criteria_raw) <= 8:
        return None
    criteria = [criterion_of(entry) for entry in criteria_raw]
    if any(criterion is None for criterion in criteria):
        return None
    parsed_criteria = [entry for entry in criteria if entry is not None]
    if sum(int(criterion["points"]) for criterion in parsed_criteria) != 10:
        return None
    minutes = whole(raw.get("estimatedMinutes"))
    if minutes is None or not 5 <= minutes <= 120:
        return None
    pass_points = whole(raw.get("passPoints", 8))
    if pass_points is None or not 1 <= pass_points <= 10:
        return None
    sources = _list(raw.get("sources", []))
    if sources is None or len(sources) > 20 or any(_mapping(entry) is None for entry in sources):
        return None
    return {
        "title": str(raw["title"]),
        "taskMd": str(raw["taskMd"]),
        "data": [str(entry) for entry in data],
        "deliverable": str(raw["deliverable"]),
        "production": production,
        "explanationPrompt": None if explanation is None else str(explanation),
        "hints": [str(entry) for entry in hints],
        "criteria": parsed_criteria,
        "estimatedMinutes": minutes,
        "passPoints": pass_points,
        "sources": [dict(entry) for entry in sources],
    }


def parse_submission(value: Any) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
    """`ExerciseSubmissionSchema.safeParse`: the parsed submission and its issues."""
    raw = _mapping(value)
    if raw is None:
        return None, [issue("submission", "Expected object")]
    kind = raw.get("kind")
    if not isinstance(kind, str) or kind not in PRODUCTION_KINDS:
        return None, [issue("kind", "Invalid discriminator value")]
    unknown = set(raw) - SUBMISSION_KEYS[kind]
    if unknown:
        return None, [issue(sorted(unknown)[0], "Unrecognized key")]

    def with_explanation(
        parsed: dict[str, Any],
    ) -> tuple[dict[str, Any] | None, list[dict[str, str]]]:
        explanation = raw.get("explanation")
        if explanation is None:
            return parsed, []
        if not isinstance(explanation, str):
            return None, [issue("explanation", "Expected string")]
        if len(explanation) > 2000:
            return None, [issue("explanation", "Too big")]
        parsed["explanation"] = explanation
        return parsed, []

    if kind == "text":
        text = raw.get("text")
        if not isinstance(text, str):
            return None, [issue("text", "Expected string")]
        if len(text) > 10000:
            return None, [issue("text", "Too big")]
        return with_explanation({"kind": "text", "text": text})
    if kind == "file":
        resource_id = raw.get("resourceId")
        if not is_uuid(resource_id):
            return None, [issue("resourceId", "Invalid UUID")]
        return with_explanation({"kind": "file", "resourceId": str(resource_id)})
    if kind == "link":
        url = raw.get("url")
        if not isinstance(url, str) or not valid_link(url):
            return None, [issue("url", "Invalid url")]
        return with_explanation({"kind": "link", "url": url})
    fields_raw = _mapping(raw.get("fields"))
    rows_raw = _list(raw.get("rows"))
    if fields_raw is None or rows_raw is None:
        return None, [issue("fields", "Expected object")]
    fields: dict[str, str] = {}
    for key, entry in fields_raw.items():
        if not isinstance(entry, str) or len(entry) > 2000:
            return None, [issue(f"fields.{key}", "Invalid value")]
        fields[str(key)] = entry
    rows: list[dict[str, str]] = []
    for index, entry in enumerate(rows_raw):
        row = _mapping(entry)
        if row is None:
            return None, [issue(f"rows.{index}", "Expected object")]
        parsed_row: dict[str, str] = {}
        for key, cell in row.items():
            if not isinstance(cell, str) or len(cell) > 2000:
                return None, [issue(f"rows.{index}.{key}", "Invalid value")]
            parsed_row[str(key)] = cell
        rows.append(parsed_row)
    return with_explanation({"kind": "table", "fields": fields, "rows": rows})


def valid_link(value: str) -> bool:
    """`z.url()` refined on HTTPS: a parseable absolute HTTPS URL."""
    from urllib.parse import urlparse

    if value.strip() != value or not value.startswith("https://"):
        return False
    parsed = urlparse(value)
    return parsed.scheme == "https" and parsed.netloc != ""


def has_value(value: Any) -> bool:
    """`hasValue`: a string with at least one non-whitespace character."""
    return isinstance(value, str) and value.strip() != ""


def validate_column_value(column: Mapping[str, Any], value: Any, path: str) -> list[dict[str, str]]:
    """`validateColumnValue`: required, typed and constrained to the declared options."""
    label = str(column["label"])
    if not has_value(value):
        return [issue(path, texts.EXERCISE_CELL_REQUIRED.format(label=label))]
    if column["type"] == "number":
        if parse_french_number(str(value)) is None:
            return [issue(path, texts.EXERCISE_CELL_NUMBER.format(label=label))]
        return []
    if column["type"] == "select":
        allowed = {str(option["value"]) for option in column.get("options", [])}
        if str(value) not in allowed:
            return [issue(path, texts.EXERCISE_CELL_SELECT.format(label=label))]
    return []


def validate_table(production: Mapping[str, Any], submission: Mapping[str, Any]) -> list[dict[str, str]]:
    """`validateTable`: one issue per faulty cell, then the declared totals."""
    issues: list[dict[str, str]] = []
    fields = submission.get("fields", {})
    rows = submission.get("rows", [])
    for field in production["fields"]:
        issues.extend(validate_column_value(field, fields.get(field["key"]), f"fields.{field['key']}"))
    minimum = int(production["minRows"])
    maximum = int(production["maxRows"])
    if len(rows) < minimum:
        issues.append(issue("rows", texts.EXERCISE_ROWS_MIN.format(count=minimum)))
    if len(rows) > maximum:
        issues.append(issue("rows", texts.EXERCISE_ROWS_MAX.format(count=maximum)))
    for index, row in enumerate(rows):
        for column in production["columns"]:
            issues.extend(
                validate_column_value(column, row.get(column["key"]), f"rows.{index}.{column['key']}")
            )
    if not issues and production["checks"]:
        results = evaluate_table_checks(production, {"fields": fields, "rows": rows})
        for result in results:
            if result["state"] != "balanced":
                issues.append(issue("rows", str(result["label"])))
    return issues


def validate_explanation(instruction: Mapping[str, Any], explanation: Any) -> list[dict[str, str]]:
    """`validateExplanation`: the written explanation is required when the instruction asks."""
    if instruction["explanationPrompt"] is None:
        return []
    text = explanation.strip() if isinstance(explanation, str) else ""
    if len(text) < MIN_EXPLANATION_CHARS:
        return [issue("explanation", texts.EXERCISE_EXPLANATION_REQUIRED)]
    return []


def validate_production(
    instruction: Mapping[str, Any], submission: Mapping[str, Any]
) -> list[dict[str, str]]:
    """EF-1, ET-3, CL-4 - validates a parsed submission against the immutable instruction."""
    production = instruction["production"]
    if submission["kind"] != production["kind"]:
        return [issue("kind", texts.EXERCISE_KIND_MISMATCH)]
    issues: list[dict[str, str]] = []
    if production["kind"] == "text":
        text = str(submission.get("text", "")).strip()
        minimum = int(production["minChars"])
        maximum = int(production["maxChars"])
        if not minimum <= len(text) <= maximum:
            issues.append(
                issue(
                    "text",
                    texts.EXERCISE_PRODUCTION_TEXT.format(min_chars=minimum, max_chars=maximum),
                )
            )
    elif production["kind"] == "file":
        if submission["kind"] != "file":
            issues.append(issue("resourceId", texts.EXERCISE_PRODUCTION_FILE))
    elif production["kind"] == "link":
        if submission["kind"] != "link":
            issues.append(issue("url", texts.EXERCISE_PRODUCTION_LINK))
    elif submission["kind"] == "table":
        issues.extend(validate_table(production, submission))
    if submission["kind"] not in ("file", "link"):
        issues.extend(validate_explanation(instruction, submission.get("explanation")))
    return issues


def js_trunc(value: float) -> int:
    """`Math.trunc`: toward zero, `0` for a non-finite value."""
    if not math.isfinite(value):
        return 0
    return int(value)


def clamp(value: int, minimum: int, maximum: int) -> int:
    """`clamp`: bounded on both sides."""
    return min(maximum, max(minimum, value))


def is_explanation_criterion(criterion: Mapping[str, Any]) -> bool:
    """`isExplanationCriterion`: the criterion that carries the written explanation."""
    return EXPLANATION_CRITERION.search(f"{criterion['key']} {criterion['label']}") is not None


def valid_explanation(value: Any) -> bool:
    """`validExplanation`: long enough and mentioning the rule of the course."""
    if not isinstance(value, str):
        return False
    text = value.strip()
    if len(text) < VALID_EXPLANATION_CHARS:
        return False
    return EXPLANATION_PATTERN.search(text) is not None


def production_complete(instruction: Mapping[str, Any], submission: Mapping[str, Any]) -> bool:
    """`productionComplete`: the production fills every expected cell of its kind."""
    production = instruction["production"]
    if submission["kind"] == "table":
        if production["kind"] != "table":
            return False
        if any(not has_value(value) for value in submission.get("fields", {}).values()):
            return False
        rows = submission.get("rows", [])
        if len(rows) < int(production["minRows"]):
            return False
        return all(has_value(row.get(column["key"])) for row in rows for column in production["columns"])
    if submission["kind"] == "text":
        return bool(
            production["kind"] == "text"
            and len(str(submission.get("text", "")).strip()) >= int(production["minChars"])
        )
    if submission["kind"] == "file":
        return bool(production["kind"] == "file")
    return bool(production["kind"] == "link")


def mock_tutor(instruction: Mapping[str, Any], submission: Mapping[str, Any]) -> dict[str, Any]:
    """The committed `LLM_MODE=mock` fixture of the tutor (SPEC-613 EF-2)."""
    complete = production_complete(instruction, submission)
    explained = valid_explanation(submission.get("explanation"))
    scores: list[dict[str, Any]] = []
    for criterion in instruction["criteria"]:
        label = str(criterion["label"])
        points = int(criterion["points"])
        if is_explanation_criterion(criterion):
            scores.append(
                {
                    "key": str(criterion["key"]),
                    "earned": points if explained else 0,
                    "comment": texts.EXERCISE_EXPLANATION_OK
                    if explained
                    else texts.EXERCISE_EXPLANATION_MISSING,
                }
            )
            continue
        scores.append(
            {
                "key": str(criterion["key"]),
                "earned": points if complete else 0,
                "comment": texts.EXERCISE_CRITERION_CONFORM.format(label=label)
                if complete
                else texts.EXERCISE_CRITERION_INCOMPLETE.format(label=label),
            }
        )
    return {
        "scores": scores,
        "summary": texts.EXERCISE_SUMMARY_COMPLETE if complete else texts.EXERCISE_SUMMARY_INCOMPLETE,
    }


def normalize_tutor_correction(instruction: Mapping[str, Any], raw: Mapping[str, Any]) -> dict[str, Any]:
    """CL-5 - bounds every tutor sub-score before persistence; overshoots are clamped."""
    by_key = {str(score.get("key")): score for score in raw.get("scores", []) if isinstance(score, Mapping)}
    rejected: list[str] = []
    criteria: list[dict[str, Any]] = []
    for criterion in instruction["criteria"]:
        key = str(criterion["key"])
        points = int(criterion["points"])
        candidate = by_key.get(key)
        raw_earned: Any = None if candidate is None else candidate.get("earned")
        value = float(raw_earned) if is_number(raw_earned) else 0.0
        bounded = clamp(js_trunc(value), 0, points)
        if candidate is not None and (
            not is_number(raw_earned) or float(raw_earned) < 0 or float(raw_earned) > points
        ):
            rejected.append(key)
        passed = bounded == points
        comment = candidate.get("comment") if candidate is not None else None
        criteria.append(
            {
                "key": key,
                "label": str(criterion["label"]),
                "points": points,
                "earned": bounded,
                "ok": passed,
                "comment": comment
                if isinstance(comment, str)
                else (texts.EXERCISE_CRITERION_OK if passed else texts.EXERCISE_CRITERION_RETRY),
            }
        )
    return {
        "criteria": criteria,
        "rejectedKeys": rejected,
        "summary": str(raw.get("summary", "")),
    }


def grade_exercise(
    instruction: Mapping[str, Any],
    submission: Mapping[str, Any],
    *,
    hints_used: Any,
    next_step: Mapping[str, str],
    tutor: Any = None,
) -> dict[str, Any]:
    """ET-4 - validates, asks the tutor, bounds the sub-scores and applies the hint penalty."""
    issues = validate_production(instruction, submission)
    if issues:
        return {"ok": False, "issues": issues}
    hints = clamp(js_trunc(float(hints_used)) if is_number(hints_used) else 0, 0, 2)
    max_score = max(0, 10 - hints)
    raw = mock_tutor(instruction, submission) if tutor is None else tutor(instruction, submission)
    normalized = normalize_tutor_correction(instruction, raw)
    total = sum(int(criterion["earned"]) for criterion in normalized["criteria"])
    score = min(total, max_score)
    verdict = "passed" if score >= int(instruction["passPoints"]) else "retry"
    return {
        "ok": True,
        "value": {
            "score": score,
            "maxScore": max_score,
            "verdict": verdict,
            "criteria": normalized["criteria"],
            "summary": normalized["summary"],
            "nextStep": {"label": str(next_step["label"]), "href": str(next_step["href"])},
        },
    }


def next_step_for(*, notion_label: str, formation_id: str, passed: bool) -> dict[str, str]:
    """`nextStepFor`: the follow-up link of a submission."""
    if passed:
        return {
            "label": texts.EXERCISE_NEXT_STEP_PASSED.format(notion=notion_label),
            "href": f"/formations/{formation_id}/programme",
        }
    return {
        "label": texts.EXERCISE_NEXT_STEP_RETRY.format(notion=notion_label),
        "href": f"/formations/{formation_id}/lacunes",
    }


__all__ = [
    "COLUMN_TYPES",
    "MIME_TYPES",
    "PRODUCTION_KINDS",
    "check_of",
    "clamp",
    "column_of",
    "criterion_of",
    "grade_exercise",
    "is_explanation_criterion",
    "mock_tutor",
    "next_step_for",
    "normalize_tutor_correction",
    "parse_instruction",
    "parse_submission",
    "production_complete",
    "production_of",
    "valid_explanation",
    "valid_link",
    "validate_explanation",
    "validate_production",
    "validate_table",
]
