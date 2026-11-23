"""Response schemas of an instruction brick (SPEC-502 ET-1).

The text, file, link and structured table productions, with the row and character bounds fixed on
the brick at creation. The stable code and the JSON paths of an issue are preserved; the message is
written in English (ADR-2011).
"""

from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.domain.bricks.grade_support import invalid_response
from learny.assessments.domain.bricks.responses import read_object, read_record, read_string

HINT_LIMIT = 2000


def _read_explanation(parsed: Mapping[str, Any]) -> str | None:
    explanation = parsed.get("explanation")
    if explanation is None:
        return None
    if not isinstance(explanation, str) or len(explanation.strip()) > HINT_LIMIT:
        raise invalid_response(
            [{"path": "response.explanation", "message": "At most 2000 characters are allowed."}]
        )
    return explanation.strip()


def _read_table(production: Mapping[str, Any], response: Any) -> dict[str, Any]:
    parsed = read_object(response, ("fields", "rows", "explanation"), optional=("explanation",))
    fields = read_record(parsed["fields"], "response.fields", value_max_length=2000, nullable=False)
    rows_raw = parsed["rows"]
    if not isinstance(rows_raw, list):
        raise invalid_response([{"path": "response.rows", "message": "An array is required."}])
    rows = [
        read_record(row, f"response.rows.{index}", value_max_length=2000, nullable=False)
        for index, row in enumerate(rows_raw)
    ]
    count = len(rows)
    minimum = int(production["minRows"])
    maximum = int(production["maxRows"])
    if count < minimum or count > maximum:
        raise invalid_response(
            [
                {
                    "path": "response.rows",
                    "message": (
                        f"The table must contain between {minimum} and {maximum} rows (found {count})."
                    ),
                }
            ]
        )
    result: dict[str, Any] = {"fields": fields, "rows": rows}
    explanation = _read_explanation(parsed)
    if explanation is not None:
        result["explanation"] = explanation
    return result


def _read_text(production: Mapping[str, Any], response: Any) -> dict[str, Any]:
    parsed = read_object(response, ("text", "explanation"), optional=("explanation",))
    text_raw = parsed["text"]
    if not isinstance(text_raw, str):
        raise invalid_response([{"path": "response.text", "message": "A string is required."}])
    if len(text_raw) > 10_000:
        raise invalid_response(
            [{"path": "response.text", "message": "At most 10000 characters are allowed."}]
        )
    length = len(text_raw)
    minimum = int(production["minChars"])
    maximum = int(production["maxChars"])
    if length < minimum or length > maximum:
        raise invalid_response(
            [
                {
                    "path": "response.text",
                    "message": (
                        f"The text must contain between {minimum} and {maximum} characters (found {length})."
                    ),
                }
            ]
        )
    result: dict[str, Any] = {"text": text_raw}
    explanation = _read_explanation(parsed)
    if explanation is not None:
        result["explanation"] = explanation
    return result


def _read_file(response: Any) -> dict[str, Any]:
    parsed = read_object(response, ("resourceId", "explanation"), optional=("explanation",))
    resource_id = read_string(parsed["resourceId"], "response.resourceId", minimum=1, maximum=64)
    result: dict[str, Any] = {"resourceId": resource_id}
    explanation = _read_explanation(parsed)
    if explanation is not None:
        result["explanation"] = explanation
    return result


def _read_link(response: Any) -> dict[str, Any]:
    parsed = read_object(response, ("url", "explanation"), optional=("explanation",))
    url = parsed["url"]
    if not isinstance(url, str) or not url.startswith("https://"):
        raise invalid_response([{"path": "response.url", "message": "The link must use HTTPS."}])
    result: dict[str, Any] = {"url": url}
    explanation = _read_explanation(parsed)
    if explanation is not None:
        result["explanation"] = explanation
    return result


def parse_instruction_response(production: Mapping[str, Any], response: Any) -> dict[str, Any]:
    """Parses a production response against the bounds fixed on the brick at creation (ET-1)."""
    kind = production["kind"]
    if kind == "table":
        return _read_table(production, response)
    if kind == "text":
        return _read_text(production, response)
    if kind == "file":
        return _read_file(response)
    if kind == "link":
        return _read_link(response)
    raise invalid_response(
        [{"path": "type", "message": f'Brick type "instruction" has no "{kind}" production.'}]
    )


def instruction_production_kinds() -> Sequence[str]:
    """The four production kinds of an instruction brick."""
    return ("text", "file", "link", "table")


__all__ = ["instruction_production_kinds", "parse_instruction_response"]
