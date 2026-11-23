"""Validation of the three inputs of a route (SPEC-2201, port of `packages/http/src/validate.ts`).

The TypeScript wrapper validates with Zod and renders its issues with the French locale; here the
generated Pydantic models validate the same values and their errors are translated back into the
Zod issue shape (`path` prefixed by the input location, `message` from `locale_fr.validation`), so a
`400`/`422` answer is byte-identical to the one the Hono backend sends (ADR-2012, ADR-1001).
"""

import re
from collections.abc import Callable, Iterable, Mapping, Sequence, Sized
from enum import Enum
from types import NoneType, UnionType
from typing import Annotated, Any, Literal, Union, get_args, get_origin
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from learny.engagement.public import push_upsert_issues
from learny.shared.errors import AppError
from learny.shared.jsonx import dumps
from learny.shared.locale_fr import ai as ai_texts
from learny.shared.locale_fr import learning as learning_texts
from learny.shared.locale_fr import review as review_texts
from learny.shared.locale_fr import validation
from learny.shared.locale_fr.details import INVALID_INPUT, INVITATION_CODE_FORMAT
from learny.tutor.public import (
    create_body_issues as credential_create_issues,
)
from learny.tutor.public import (
    discover_body_issues as credential_discover_issues,
)
from learny.tutor.public import (
    models_update_issues as models_tab_update_issues,
)
from pydantic import BaseModel, ValidationError

InputLocation = Literal["params", "query", "body"]

# The OpenAPI document loses the object key order of the Zod contract, so the generated models
# validate alphabetically. Zod reports the issues in declaration order; this table restores it for
# the routes whose contract order is observable in the 400 body (ADR-1001).
ISSUE_ORDER: dict[str, tuple[str, ...]] = {
    "agenda.get": ("query.from", "query.to", "query.formation"),
}

# Zod carries a custom message for some `.regex(...)` rules; OpenAPI keeps only the pattern, so the
# generic `invalid_format` wording would replace the contract's message. The generic wording stays
# for every failure but the pattern mismatch of these paths (ADR-1001, ADR-2012).
MESSAGE_OVERRIDES: dict[str, dict[str, str]] = {
    "me.ai.credentials.create": {
        "body.apiKey": ai_texts.API_KEY_NO_BLANK,
        "body.modelIds.*": ai_texts.MODEL_ID_PATTERN,
    },
    "me.ai.credentials.discover": {
        "body.apiKey": ai_texts.API_KEY_NO_BLANK,
    },
}


def _message_override(messages: Mapping[str, str] | None, path: str) -> str | None:
    """The custom message of one path, honouring the `<prefix>.*` entries of the table."""
    if messages is None:
        return None
    exact = messages.get(path)
    if exact is not None:
        return exact
    for key, message in messages.items():
        if key.endswith(".*") and path.startswith(key[:-1]):
            return message
    return None


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
    route_id: str | None = None,
) -> BaseModel:
    """Parses `value`; on failure raises `VALIDATION_FAILED` with the Zod-shaped issues.

    A body is validated from its JSON form, like `schema.safeParse` on a decoded body: Pydantic's
    JSON mode accepts the string value of a `StrEnum` while still refusing `"20"` for an `int`
    (ADR-2030). Path and query inputs keep the object mode.
    """
    try:
        if strict:
            return model.model_validate_json(dumps(value), strict=True)
        return model.model_validate(value, strict=strict)
    except ValidationError as error:
        raise AppError(
            "VALIDATION_FAILED",
            INVALID_INPUT,
            **({} if status is None else {"status": status}),
            errors=issues_of(
                model,
                error,
                location,
                issue_order=ISSUE_ORDER.get(route_id or ""),
                messages=MESSAGE_OVERRIDES.get(route_id or ""),
            ),
        ) from error


def invalid_input(path: str, message: str) -> AppError:
    """The `invalidInput` shortcut: one issue, no explicit status (400 from the catalog)."""
    return AppError("VALIDATION_FAILED", INVALID_INPUT, errors=[{"path": path, "message": message}])


def issues_of(
    model: type[BaseModel],
    error: ValidationError,
    location: InputLocation,
    *,
    issue_order: Sequence[str] | None = None,
    messages: Mapping[str, str] | None = None,
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
        path = _path(location, loc)
        message = _message(model, entry, kind)
        if kind == "string_pattern_mismatch":
            message = _message_override(messages, path) or message
        issues.append({"path": path, "message": message})
    for parent in order:
        keys = extras[parent]
        issues.insert(
            _insertion_index(issues, error, parent),
            {"path": _path(location, parent), "message": validation.unrecognized_keys(keys)},
        )
    if issue_order:
        ranked = {path: index for index, path in enumerate(issue_order)}
        issues.sort(key=lambda issue: ranked.get(issue["path"], len(ranked)))
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
            field = next(
                (item for item in current.model_fields.values() if item.alias == str(part)),
                None,
            )
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


# --------------------------------------------------------------------------------------------------
# Refinements the generated model cannot express
# --------------------------------------------------------------------------------------------------
#
# `datamodel-codegen` keeps the shape of an OpenAPI schema but drops the Zod refinements and
# transforms of `packages/contracts`: "at least one field", uniqueness of an array, a reminder only
# on the `depart` step, an IANA time zone, and the `trim()` every string goes through. Applying them
# here keeps the pipeline the single validation point (ADR-2012) and the answer byte-identical.

Refinement = Callable[[Mapping[str, Any]], list[dict[str, str]] | None]

PROFILE_FIELDS = ("firstName", "lastName", "tutorTone", "courseLanguage", "timezone")
SETTINGS_FIELDS = (*PROFILE_FIELDS, "rhythm")


def _issue(path: str, message: str) -> dict[str, str]:
    return {"path": path, "message": message}


def _blank_string_issue(path: str) -> list[dict[str, str]]:
    return [_issue(path, validation.too_small("string", 1, inclusive=True))]


def _at_least_one_profile_field(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    if not any(field in value for field in PROFILE_FIELDS):
        return [_issue("body", validation.PROFILE_FIELD_REQUIRED)]
    return _trimmed_profile(value)


def _at_least_one_settings_field(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    if not any(field in value for field in SETTINGS_FIELDS):
        return [_issue("body", validation.PROFILE_FIELD_REQUIRED)]
    return _trimmed_profile(value)


def _trimmed_profile(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    """`z.string().trim()`: the name is validated after trimming; the IANA zone is checked here."""
    errors: list[dict[str, str]] = []
    first_name = value.get("firstName")
    if isinstance(first_name, str) and first_name.strip() == "":
        errors.extend(_blank_string_issue("body.firstName"))
    timezone = value.get("timezone")
    if isinstance(timezone, str) and not _is_iana_zone(timezone):
        errors.append(_issue("body.timezone", validation.UNKNOWN_TIME_ZONE))
    return errors or None


def _is_iana_zone(value: str) -> bool:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True


def _unique_preferences(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    errors: list[dict[str, str]] = []
    days = value.get("studyDays")
    if isinstance(days, list) and len(set(days)) != len(days):
        errors.append(_issue("body.studyDays", validation.STUDY_DAYS_UNIQUE))
    slots = value.get("preferredSlots")
    if isinstance(slots, list) and len(set(slots)) != len(slots):
        errors.append(_issue("body.preferredSlots", validation.STUDY_SLOTS_UNIQUE))
    return errors or None


def _onboarding_reminders(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    if "reminders" not in value:
        return None
    if value["reminders"] is None:
        return [_issue("body.reminders", validation.invalid_type("object", "null"))]
    if value.get("step") != "depart":
        return [_issue("body.reminders", validation.REMINDERS_NEED_DEPART)]
    return None


def _sidebar_update(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    errors: list[dict[str, str]] = []
    if "collapsed" not in value and "currentFormationId" not in value:
        return [_issue("body", validation.SIDEBAR_UPDATE_REQUIRED)]
    if "collapsed" in value and value["collapsed"] is None:
        errors.append(_issue("body.collapsed", validation.invalid_type("boolean", "null")))
    if "currentFormationId" in value and value["currentFormationId"] is None:
        errors.append(_issue("body.currentFormationId", validation.invalid_type("UUID", "null")))
    return errors or None


def _task_model(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    model_id = value.get("modelId")
    if isinstance(model_id, str) and model_id.strip() == "":
        return _blank_string_issue("body.modelId")
    return None


def _legal_versions(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    errors: list[dict[str, str]] = []
    for field in ("cguVersion", "privacyVersion"):
        version = value.get(field)
        if isinstance(version, str) and version.strip() == "":
            errors.extend(_blank_string_issue(f"body.{field}"))
    return errors or None


def _agenda_range(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    """`AgendaQuery` refinements: ordered civil bounds and a window of 42 days at most."""
    start = value.get("from_")
    end = value.get("to")
    if not isinstance(start, str) or not isinstance(end, str):
        return None
    if start > end:
        return [_issue("query", learning_texts.AGENDA_RANGE_ORDER)]
    if _civil_day_distance(start, end) > MAX_AGENDA_RANGE_DAYS:
        return [_issue("query", learning_texts.AGENDA_RANGE_TOO_WIDE)]
    return None


def _slot_move_window(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    """`SlotMoveInput` refinement: the end of the moved window must follow its start."""
    start = value.get("startsAt")
    end = value.get("endsAt")
    if not isinstance(start, str) or not isinstance(end, str):
        return None
    if end <= start:
        return [
            _issue(
                learning_texts.PLANNING_MOVE_WINDOW_PATH,
                learning_texts.PLANNING_MOVE_WINDOW_ORDER,
            )
        ]
    return None


def _civil_day_distance(start: str, end: str) -> int:
    """`civilDayDistance`: civil days between two `YYYY-MM-DD` values (`to - from`)."""
    from datetime import date

    first = date(int(start[0:4]), int(start[5:7]), int(start[8:10]))
    second = date(int(end[0:4]), int(end[5:7]), int(end[8:10]))
    return (second - first).days


MAX_AGENDA_RANGE_DAYS = 42


def _review_answer_choice(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    """`ReviewAnswerInputSchema` refinement: exactly one of `skipped` or `response` is required."""
    has_skipped = value.get("skipped") is True
    has_response = "response" in value and value.get("response") is not None
    if has_skipped == has_response:
        return [_issue("body", review_texts.REVIEW_ANSWER_EXCLUSIVE)]
    return None


REFINEMENTS: dict[str, Refinement] = {
    "me.update": _at_least_one_profile_field,
    "me.profile.update": _at_least_one_settings_field,
    "me.preferences.update": _unique_preferences,
    "me.onboarding.update": _onboarding_reminders,
    "me.ai.credentials.create": credential_create_issues,
    "me.ai.credentials.discover": credential_discover_issues,
    "me.ai.models.update": models_tab_update_issues,
    "me.ai.task-models.update": _task_model,
    "me.legal.accept": _legal_versions,
    "sidebar.update": _sidebar_update,
    "agenda.get": _agenda_range,
    "slots.move": _slot_move_window,
    "review.answer": _review_answer_choice,
    "pushSubscriptions.upsert": push_upsert_issues,
}


# --------------------------------------------------------------------------------------------------
# Transforms the generated model cannot express, applied before validation
# --------------------------------------------------------------------------------------------------
#
# `InvitationCode` is `z.string().trim().toUpperCase().regex(/^LRN-[A-Z2-9]{4}$/)`: the normalisation
# happens *before* the pattern, so `' lrn-ab23 '` is a valid code. OpenAPI cannot express a
# transform, and `datamodel-codegen` drops it; the pipeline therefore normalises the path parameter
# here and renders the same Zod issue for a value that stays invalid.

INVITE_CODE_ROUTE_IDS = frozenset({"invitations.get", "invitations.accept"})
_INVITE_CODE_PATTERN = re.compile(r"^LRN-[A-Z2-9]{4}$")


def normalize_params(route_id: str, value: Mapping[str, Any], *, status: int | None = None) -> dict[str, Any]:
    """Applies the contract transforms of the path parameters before the generated model runs."""
    params = dict(value)
    if route_id in INVITE_CODE_ROUTE_IDS and isinstance(params.get("code"), str):
        code = params["code"].strip().upper()
        if _INVITE_CODE_PATTERN.match(code) is None:
            raise AppError(
                "VALIDATION_FAILED",
                INVALID_INPUT,
                **({} if status is None else {"status": status}),
                errors=[{"path": "params.code", "message": INVITATION_CODE_FORMAT}],
            )
        params["code"] = code
    return params


def apply_refinement(route_id: str, value: Any, *, status: int | None = None) -> None:
    """Applies the contract refinements of one route after the generated model validated `value`."""
    refine = REFINEMENTS.get(route_id)
    if refine is None or not isinstance(value, Mapping):
        return
    errors = refine(value)
    if errors:
        raise AppError(
            "VALIDATION_FAILED",
            INVALID_INPUT,
            **({} if status is None else {"status": status}),
            errors=errors,
        )
