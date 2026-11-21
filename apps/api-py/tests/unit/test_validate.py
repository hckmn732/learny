"""[SPEC-2201] `validate.ts` and the Zod French locale are ported message for message.

The wrapper answers `VALIDATION_FAILED` with `{path, message}` issues built from the Zod French
locale; the Python pipeline must produce the same strings from Pydantic errors.
"""

from typing import Any, Literal

import pytest
from learny.shared.errors import AppError
from learny.shared.locale_fr import validation
from learny.shared.locale_fr.details import INVALID_JSON_BODY
from learny_api.validate import (
    apply_refinement,
    invalid_input,
    issues_of,
    query_to_object,
    validate_input,
)
from pydantic import BaseModel, ConfigDict, Field, ValidationError

pytestmark = pytest.mark.spec("SPEC-2201")


class Kind(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["a", "b"]


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=3, max_length=8)
    age: int = Field(ge=18, le=99)
    tag: str = Field(pattern="^[a-z]+$")
    choice: Literal["x", "y"] = "x"


def problem_of(error: AppError) -> dict[str, Any]:
    return dict(error.extra)


def test_query_to_object_turns_a_repeated_key_into_an_array() -> None:
    items = [("a", "1"), ("b", "2"), ("a", "3")]

    assert query_to_object(items) == {"a": ["1", "3"], "b": "2"}


def test_query_to_object_keeps_the_first_seen_order() -> None:
    items = [("z", "1"), ("a", "2")]

    assert list(query_to_object(items)) == ["z", "a"]


def test_a_missing_field_is_reported_like_zod() -> None:
    with pytest.raises(AppError) as raised:
        validate_input(Body, {}, "body")

    assert raised.value.code == "VALIDATION_FAILED"
    issues = problem_of(raised.value)["errors"]
    assert {
        "path": "body.name",
        "message": "Entr\u00e9e invalide : cha\u00eene de caract\u00e8res attendu, ind\u00e9fini re\u00e7u",
    } in issues


def test_a_wrong_type_names_both_sides() -> None:
    with pytest.raises(AppError) as raised:
        validate_input(Body, {"name": 1, "age": 20, "tag": "ab"}, "body")

    issues = problem_of(raised.value)["errors"]
    assert {
        "path": "body.name",
        "message": "Entr\u00e9e invalide : cha\u00eene de caract\u00e8res attendu, nombre re\u00e7u",
    } in issues


def test_a_number_sent_as_a_string_is_refused_in_strict_mode() -> None:
    with pytest.raises(AppError):
        validate_input(Body, {"name": "abc", "age": "20", "tag": "ab"}, "body", strict=True)


def test_a_number_sent_as_a_string_is_accepted_in_lax_mode() -> None:
    parsed = validate_input(Body, {"name": "abc", "age": "20", "tag": "ab"}, "query")

    assert parsed.age == 20  # type: ignore[attr-defined]


def test_a_pattern_mismatch_reuses_the_contract_pattern() -> None:
    with pytest.raises(AppError) as raised:
        validate_input(Body, {"name": "abc", "age": 20, "tag": "ABC"}, "body")

    issues = problem_of(raised.value)["errors"]
    assert issues[0]["message"] == (
        "Cha\u00eene de caract\u00e8res invalide : doit correspondre au motif ^[a-z]+$"
    )


def test_a_string_length_bound_is_a_sizing_message() -> None:
    with pytest.raises(AppError) as raised:
        validate_input(Body, {"name": "ab", "age": 20, "tag": "ab"}, "body")

    issues = problem_of(raised.value)["errors"]
    assert (
        issues[0]["message"] == "Trop petit : cha\u00eene de caract\u00e8res doit avoir >=3 caract\u00e8res"
    )


def test_a_numeric_bound_is_an_unsized_message() -> None:
    with pytest.raises(AppError) as raised:
        validate_input(Body, {"name": "abc", "age": 17, "tag": "ab"}, "body")

    issues = problem_of(raised.value)["errors"]
    assert issues[0]["message"] == "Trop petit : entier doit \u00eatre >=18"


def test_an_unknown_key_is_reported_as_a_single_issue() -> None:
    with pytest.raises(AppError) as raised:
        validate_input(Body, {"name": "abc", "age": 20, "tag": "ab", "extra": 1}, "body")

    issues = problem_of(raised.value)["errors"]
    assert {"path": "body", "message": 'Cl\u00e9 non reconnue : "extra"'} in issues


def test_a_literal_mismatch_lists_the_allowed_values() -> None:
    with pytest.raises(AppError) as raised:
        validate_input(Body, {"name": "abc", "age": 20, "tag": "ab", "choice": "z"}, "body")

    issues = problem_of(raised.value)["errors"]
    assert issues[0]["message"] == 'Option invalide : une valeur parmi "x"|"y" attendue'


def test_the_route_status_overrides_the_catalog_one() -> None:
    with pytest.raises(AppError) as raised:
        validate_input(Body, {}, "body", status=422)

    assert raised.value.status == 422


def test_the_path_is_prefixed_by_the_input_location() -> None:
    with pytest.raises(AppError) as raised:
        validate_input(Body, {"name": "abc", "age": 20, "tag": "ab", "nested": [1]}, "body")

    paths = {issue["path"] for issue in problem_of(raised.value)["errors"]}
    assert paths == {"body"}


def test_invalid_input_builds_a_single_body_issue() -> None:
    error = invalid_input("body", INVALID_JSON_BODY)

    assert error.code == "VALIDATION_FAILED"
    assert error.extra["errors"] == [{"path": "body", "message": INVALID_JSON_BODY}]


def test_the_issues_helper_accepts_a_pydantic_error_directly() -> None:
    try:
        Body.model_validate({"name": "abc"})
    except ValidationError as error:
        issues = issues_of(Body, error, "body")

    assert issues
    assert all(set(issue) == {"path", "message"} for issue in issues)


# Refinements of `packages/contracts` that the generated model drops (SPEC-2201).
def refinement_issue(route_id: str, value: Any) -> dict[str, Any]:
    with pytest.raises(AppError) as raised:
        apply_refinement(route_id, value, status=400)
    error = raised.value
    assert error.code == "VALIDATION_FAILED"
    assert error.status == 400
    return dict(error.extra)


def test_me_update_requires_at_least_one_profile_field() -> None:
    problem = refinement_issue("me.update", {})

    assert problem["errors"] == [{"path": "body", "message": validation.PROFILE_FIELD_REQUIRED}]


def test_me_update_requires_a_non_blank_first_name() -> None:
    problem = refinement_issue("me.update", {"firstName": "   "})

    assert problem["errors"] == [
        {"path": "body.firstName", "message": validation.too_small("string", 1, inclusive=True)}
    ]


def test_me_profile_update_ignores_expected_updated_at_for_the_non_empty_rule() -> None:
    problem = refinement_issue("me.profile.update", {"expectedUpdatedAt": "2026-11-11T12:20:00.000Z"})

    assert problem["errors"][0]["path"] == "body"


def test_me_profile_update_rejects_an_unknown_time_zone() -> None:
    problem = refinement_issue("me.profile.update", {"timezone": "Mars/Olympus"})

    assert problem["errors"] == [{"path": "body.timezone", "message": validation.UNKNOWN_TIME_ZONE}]


def test_preferences_reject_duplicate_days_and_slots() -> None:
    problem = refinement_issue(
        "me.preferences.update",
        {"hoursPerDay": 2, "studyDays": [1, 1], "preferredSlots": ["soir", "soir"]},
    )

    assert problem["errors"] == [
        {"path": "body.studyDays", "message": validation.STUDY_DAYS_UNIQUE},
        {"path": "body.preferredSlots", "message": validation.STUDY_SLOTS_UNIQUE},
    ]


def test_reminders_are_only_accepted_on_the_depart_step() -> None:
    problem = refinement_issue(
        "me.onboarding.update",
        {"step": "rythme", "reminders": {"push": True, "email": True, "automations": True}},
    )

    assert problem["errors"] == [{"path": "body.reminders", "message": validation.REMINDERS_NEED_DEPART}]


def test_sidebar_update_requires_one_of_its_fields() -> None:
    problem = refinement_issue("sidebar.update", {})

    assert problem["errors"] == [{"path": "body", "message": validation.SIDEBAR_UPDATE_REQUIRED}]


def test_sidebar_update_rejects_an_explicit_null() -> None:
    problem = refinement_issue("sidebar.update", {"collapsed": None})

    assert problem["errors"] == [
        {"path": "body.collapsed", "message": validation.invalid_type("boolean", "null")}
    ]


def test_a_blank_model_id_is_a_validation_failure() -> None:
    problem = refinement_issue("me.ai.task-models.update", {"modelId": "  "})

    assert problem["errors"][0]["path"] == "body.modelId"


def test_a_blank_legal_version_is_a_validation_failure() -> None:
    problem = refinement_issue("me.legal.accept", {"cguVersion": " ", "privacyVersion": "2026-11-11"})

    assert problem["errors"][0]["path"] == "body.cguVersion"


def test_a_route_without_refinement_is_left_untouched() -> None:
    apply_refinement("me.get", {}, status=400)
