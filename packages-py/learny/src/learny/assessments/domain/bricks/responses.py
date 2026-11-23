"""Shape checks of the graded responses (SPEC-502 ET-1).

The TypeScript package validates a response with a Zod schema and reports every issue as
`RESPONSE_INVALID`. The Python port keeps the same stable code and the same JSON paths; the message
of an issue is written here in English instead of being copied from Zod, which is an internal
implementation detail never rendered to a learner (ADR-2011).
"""

from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.domain.bricks.grade_support import invalid_response


def _trim(value: str) -> str:
    return value.strip()


def read_object(response: Any, expected: Sequence[str], optional: Sequence[str] = ()) -> dict[str, Any]:
    """A strict object: unknown keys and missing required keys each produce one issue."""
    if not isinstance(response, Mapping):
        raise invalid_response([{"path": "response", "message": "An object is required."}])
    unknown = [key for key in response if key not in expected]
    missing = [key for key in expected if key not in response and key not in optional]
    if not unknown and not missing:
        return dict(response)
    issues = [{"path": f"response.{key}", "message": f'Missing field: "{key}".'} for key in missing]
    issues.extend({"path": "response", "message": f'Unrecognized key: "{key}".'} for key in unknown)
    raise invalid_response(issues)


def read_string(value: Any, path: str, *, minimum: int, maximum: int) -> str:
    """A trimmed string of `minimum` to `maximum` characters."""
    if not isinstance(value, str):
        raise invalid_response([{"path": path, "message": "A string is required."}])
    text = _trim(value)
    if len(text) < minimum or len(text) > maximum:
        raise invalid_response(
            [
                {
                    "path": path,
                    "message": (f"A string of {minimum} to {maximum} characters is required."),
                }
            ]
        )
    return text


def read_id_list(
    value: Any,
    path: str,
    *,
    minimum: int,
    maximum: int,
    unique_message: str,
) -> list[str]:
    """A bounded list of trimmed identifiers (1 to 8 characters) without duplicates."""
    if not isinstance(value, list):
        raise invalid_response([{"path": path, "message": "An array is required."}])
    if len(value) < minimum or len(value) > maximum:
        raise invalid_response(
            [{"path": path, "message": f"An array of {minimum} to {maximum} items is required."}]
        )
    identifiers = [
        read_string(item, f"{path}.{index}", minimum=1, maximum=8) for index, item in enumerate(value)
    ]
    if len(set(identifiers)) != len(identifiers):
        raise invalid_response([{"path": path, "message": unique_message}])
    return identifiers


def read_record(
    value: Any, path: str, *, value_max_length: int | None, nullable: bool
) -> dict[str, str | None]:
    """A string-keyed record of bounded strings, optionally nullable."""
    if not isinstance(value, Mapping):
        raise invalid_response([{"path": path, "message": "An object is required."}])
    result: dict[str, str | None] = {}
    for key, item in value.items():
        at = f"{path}.{key}"
        if item is None:
            if not nullable:
                raise invalid_response([{"path": at, "message": "A string is required."}])
            result[str(key)] = None
            continue
        if not isinstance(item, str):
            raise invalid_response([{"path": at, "message": "A string is required."}])
        if value_max_length is not None and len(item) > value_max_length:
            raise invalid_response(
                [{"path": at, "message": f"At most {value_max_length} characters are allowed."}]
            )
        result[str(key)] = item
    return result


__all__ = ["read_id_list", "read_object", "read_record", "read_string"]
