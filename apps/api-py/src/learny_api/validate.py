"""Validation of the three inputs of a route (SPEC-2201, port of `packages/http/src/validate.ts`).

The TypeScript wrapper validates with Zod and renders its issues with the French locale; here the
generated Pydantic models validate the same values and their errors are translated back into the
Zod issue shape (`path` prefixed by the input location, `message` from `locale_fr.validation`), so a
`400`/`422` answer is byte-identical to the one the Hono backend sends (ADR-2012, ADR-1001).
"""

from collections.abc import Iterable, Mapping, Sequence, Sized
from enum import Enum
from types import NoneType, UnionType
from typing import Annotated, Any, Literal, Union, get_args, get_origin

from learny.shared.errors import AppError
from learny.shared.locale_fr import validation
from learny.shared.locale_fr.details import INVALID_INPUT
from pydantic import BaseModel, ValidationError

InputLocation = Literal["params", "query", "body"]

# Pydantic error type -> the Zod expected type it stands for.
_TYPE_ERRORS: dict[str, str] = {
    "string_type": "string",
    "int_type": "int",
    "int_parsing": "int",
    "int_from_float": "int",
    "float_type": "number",
    "float_parsing": "number",
    "bool_type": "boolean",
    "bool_parsing": "boolean",
    "list_type": "array",
    "tuple_type": "array",
    "dict_type": "object",
    "model_type": "object",
    "model_attributes_type": "object",
}

# Pydantic error type -> the Zod format its message comes from.
_FORMAT_ERRORS: dict[str, str] = {
    "uuid_parsing": "uuid",
    "datetime_parsing": "datetime",
    "datetime_from_date_parsing": "datetime",
    "date_parsing": "date",
    "date_from_datetime_parsing": "date",
    "time_parsing": "time",
    "duration_parsing": "duration",
    "url_parsing": "url",
}

Bounds = tuple[str, float | int, bool]


def query_to_object(items: Iterable[tuple[str, str]]) -> dict[str, str | list[str]]:
    """`queryToObject`: a repeated key becomes an array; first-seen key order is kept."""
    result: dict[str, str | list[str]] = {}
    for key, value in items:
        existing = result.get(key)
        if existing is None:
            result[key] = value
        elif isinstance(existing, list):
            existing.append(value)
        else:
            result[key] = [existing, value]
    return result


def validate_input(
    model: type[BaseModel],
    value: Any,
    location: InputLocation,
    *,
    status: int | None = None,
    strict: bool = False,
) -> BaseModel:
    """Parses `value`; on failure raises `VALIDATION_FAILED` with the Zod-shaped issues."""
    try:
        return model.model_validate(value, strict=strict)
    except ValidationError as error:
        raise AppError(
            "VALIDATION_FAILED",
            INVALID_INPUT,
            **({} if status is None else {"status": status}),
            errors=issues_of(model, error, location),
        ) from error


def invalid_input(path: str, message: str) -> AppError:
    """The `invalidInput` shortcut: one issue, no explicit status (400 from the catalog)."""
    return AppError("VALIDATION_FAILED", INVALID_INPUT, errors=[{"path": path, "message": message}])


def issues_of(
    model: type[BaseModel],
    error: ValidationError,
    location: InputLocation,
) -> list[dict[str, str]]:
    """Turns Pydantic errors into the `{path, message}` list `validate.ts` builds from Zod."""
    issues: list[dict[str, str]] = []
    extras: dict[tuple[Any, ...], list[str]] = {}
    order: list[tuple[Any, ...]] = []
    for entry in error.errors():
        loc = tuple(entry["loc"])
        kind = str(entry["type"])
        if kind == "extra_forbidden":
            parent = loc[:-1]
            if parent not in extras:
                extras[parent] = []
                order.append(parent)
            extras[parent].append(str(loc[-1]))
            continue
        issues.append(
            {"path": _path(location, loc), "message": _message(model, entry, kind)},
        )
    for parent in order:
        keys = extras[parent]
        issues.insert(
            _insertion_index(issues, error, parent),
            {"path": _path(location, parent), "message": validation.unrecognized_keys(keys)},
        )
    return issues


def _insertion_index(issues: list[dict[str, str]], error: ValidationError, parent: tuple[Any, ...]) -> int:
    """Zod reports an unknown-key issue after the declared members of the same object."""
    index = 0
    for entry in error.errors():
        loc = tuple(entry["loc"])
        if str(entry["type"]) == "extra_forbidden":
            continue
        if loc[: len(parent)] == parent:
            index += 1
        elif len(loc) > 0:
            break
    return min(index, len(issues))


def _path(location: InputLocation, loc: tuple[Any, ...]) -> str:
    """`[location, ...issue.path].join('.')`, integers included (array indexes)."""
    return ".".join([location, *(str(part) for part in loc)])


def _message(model: type[BaseModel], entry: Mapping[str, Any], kind: str) -> str:
    annotation = _annotation(model, tuple(entry["loc"]))
    context = entry.get("ctx") or {}
    if kind == "missing":
        expected = _zod_type(annotation)
        return validation.generic() if expected is None else validation.invalid_type(expected, "undefined")
    if kind in _TYPE_ERRORS:
        expected = _zod_type(annotation) or _TYPE_ERRORS[kind]
        return validation.invalid_type(expected, validation.parsed_type_name(entry.get("input")))
    if kind == "string_pattern_mismatch":
        return validation.invalid_format("regex", pattern=str(context.get("pattern", "")))
    if kind in _FORMAT_ERRORS:
        return validation.invalid_format(_FORMAT_ERRORS[kind])
    if kind in {"too_short", "string_too_short", "list_too_short"}:
        return _too_small(annotation, context, entry)
    if kind in {"too_long", "string_too_long", "list_too_long"}:
        return _too_big(annotation, context, entry)
    if kind == "greater_than_equal":
        return _bound(annotation, context, "ge", too_small=True)
    if kind == "greater_than":
        return _bound(annotation, context, "gt", too_small=True)
    if kind == "less_than_equal":
        return _bound(annotation, context, "le", too_small=False)
    if kind == "less_than":
        return _bound(annotation, context, "lt", too_small=False)
    if kind == "literal_error":
        return validation.invalid_value(_literal_values(annotation, context))
    if kind == "enum":
        return validation.invalid_value(_enum_values(annotation, context))
    if kind == "none_required":
        return validation.invalid_type("null", validation.parsed_type_name(entry.get("input")))
    return validation.generic()


def _too_small(annotation: Any, context: Mapping[str, Any], entry: Mapping[str, Any]) -> str:
    origin = _zod_type(annotation) or "string"
    minimum = context.get("min_length")
    if minimum is None:
        minimum = context.get("min_items")
    if minimum is None:
        measured = entry.get("input")
        minimum = len(measured) if isinstance(measured, Sized) else 0
    return validation.too_small(origin, minimum, inclusive=True)


def _too_big(annotation: Any, context: Mapping[str, Any], entry: Mapping[str, Any]) -> str:
    origin = _zod_type(annotation) or "string"
    maximum = context.get("max_length")
    if maximum is None:
        maximum = context.get("max_items")
    if maximum is None:
        measured = entry.get("input")
        maximum = len(measured) if isinstance(measured, Sized) else 0
    return validation.too_big(origin, maximum, inclusive=True)


def _bound(annotation: Any, context: Mapping[str, Any], key: str, *, too_small: bool) -> str:
    origin = _zod_type(annotation) or "number"
    bound = context.get(key, 0)
    if too_small:
        return validation.too_small(origin, bound, inclusive=key == "ge")
    return validation.too_big(origin, bound, inclusive=key == "le")


def _literal_values(annotation: Any, context: Mapping[str, Any]) -> list[Any]:
    unwrapped = _unwrap(annotation)
    if get_origin(unwrapped) is Literal:
        return list(get_args(unwrapped))
    expected = context.get("expected")
    return [expected]


def _enum_values(annotation: Any, context: Mapping[str, Any]) -> list[Any]:
    unwrapped = _unwrap(annotation)
    if isinstance(unwrapped, type) and issubclass(unwrapped, Enum):
        return [member.value for member in unwrapped]
    return [context.get("expected")]


def _annotation(model: type[BaseModel], loc: tuple[Any, ...]) -> Any:
    """The annotation the issue points at, used only to name the expected type."""
    current: Any = model
    for part in loc:
        if isinstance(part, int):
            args = get_args(_unwrap(current))
            current = args[0] if args else Any
            continue
        if not (isinstance(current, type) and issubclass(current, BaseModel)):
            return None
        field = current.model_fields.get(str(part))
        if field is None:
            return None
        current = field.annotation
    return current


def _unwrap(annotation: Any) -> Any:
    """Strips `Annotated` (the generated `constr`/`conint` aliases) and single-member unions."""
    while True:
        origin = get_origin(annotation)
        if origin is Annotated:
            annotation = get_args(annotation)[0]
            continue
        if origin in (Union, UnionType):
            members = [member for member in get_args(annotation) if member is not NoneType]
            if len(members) == 1:
                annotation = members[0]
                continue
        return annotation


def _zod_type(annotation: Any) -> str | None:
    """The Zod type name of an annotation, or None when Zod would report a richer issue."""
    unwrapped = _unwrap(annotation)
    if unwrapped is None or unwrapped is NoneType:
        return "null"
    origin = get_origin(unwrapped)
    if origin is Literal:
        return None
    if origin in (list, Sequence, set, frozenset):
        return "array"
    if origin in (dict, Mapping):
        return "object"
    if isinstance(unwrapped, type):
        if issubclass(unwrapped, BaseModel):
            return "object"
        if issubclass(unwrapped, Enum):
            return None
        if issubclass(unwrapped, bool):
            return "boolean"
        if issubclass(unwrapped, int):
            return "int"
        if issubclass(unwrapped, float):
            return "number"
        if issubclass(unwrapped, str):
            return "string"
    return None
