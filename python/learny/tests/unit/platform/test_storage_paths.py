"""[SPEC-2101] Storage path helpers."""

import pytest
from learny.platform.storage import (
    MAX_STORAGE_FILE_NAME_LENGTH,
    export_path,
    is_storage_uuid,
    normalize_storage_file_name,
    parse_owned_path,
    resource_path,
)
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-2101")

USER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
OBJECT = "33333333-3333-4333-8333-333333333333"


def test_keeps_a_simple_name() -> None:
    assert normalize_storage_file_name("cours.pdf") == "cours.pdf"
    assert normalize_storage_file_name("  notes de cours.md  ") == "notes de cours.md"


def test_normalises_and_collapses() -> None:
    assert normalize_storage_file_name("a   b.txt") == "a b.txt"
    assert normalize_storage_file_name("  .cache ") == "cache"


def test_refuses_a_tab_like_any_other_control_character() -> None:
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        normalize_storage_file_name("a\tb.txt")


def test_replaces_the_characters_forbidden_by_common_filesystems() -> None:
    assert normalize_storage_file_name('a<b>c:d"e|f?g*h.txt') == "a-b-c-d-e-f-g-h.txt"


@pytest.mark.parametrize(
    "name",
    ["", "   ", ".", "..", "/etc/passwd", "a\\b.txt", "a%2Fb.txt", "a%5Cb.txt", "a%00b.txt", "../x", "a..b"],
)
def test_refuses_a_traversal_or_a_separator(name: str) -> None:
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        normalize_storage_file_name(name)


def test_refuses_a_control_character() -> None:
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        normalize_storage_file_name("a\u0000b.txt")
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        normalize_storage_file_name("a\u007fb.txt")


def test_refuses_an_encoded_separator_after_decoding() -> None:
    # A double encoding hides a slash from the first pass; the decoded form is refused.
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        normalize_storage_file_name("a%252Fb.txt")


def test_refuses_a_name_that_is_too_long() -> None:
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        normalize_storage_file_name("a" * (MAX_STORAGE_FILE_NAME_LENGTH + 1))


def test_keeps_a_name_at_the_bound() -> None:
    assert len(normalize_storage_file_name("a" * MAX_STORAGE_FILE_NAME_LENGTH)) == (
        MAX_STORAGE_FILE_NAME_LENGTH
    )


def test_builds_the_resource_path() -> None:
    assert resource_path(USER, OBJECT, "cours.pdf") == f"{USER}/{OBJECT}/cours.pdf"


def test_builds_the_export_path_with_the_fixed_name() -> None:
    assert export_path(USER, OBJECT) == f"{USER}/{OBJECT}/export.zip"
    assert export_path(USER, OBJECT, "mes-donnees.zip") == f"{USER}/{OBJECT}/mes-donnees.zip"


@pytest.mark.parametrize("user_id", ["", "u-1", "1111"])
def test_refuses_a_non_uuid_identifier(user_id: str) -> None:
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        resource_path(user_id, OBJECT, "cours.pdf")
    with pytest.raises(AppError, match="VALIDATION_FAILED"):
        export_path(USER, user_id)


def test_recognises_a_uuid() -> None:
    assert is_storage_uuid(USER) is True
    assert is_storage_uuid("nope") is False


def test_parses_an_owned_path() -> None:
    parsed = parse_owned_path(f"{USER}/{OBJECT}/cours.pdf", USER)
    assert parsed is not None
    assert parsed.user_id == USER
    assert parsed.object_id == OBJECT
    assert parsed.name == "cours.pdf"
    assert parsed.path == f"{USER}/{OBJECT}/cours.pdf"


@pytest.mark.parametrize(
    "path",
    [
        f"{OTHER}/{OBJECT}/cours.pdf",
        f"{USER}/{OBJECT}",
        f"{USER}/{OBJECT}/cours.pdf/extra",
        f"{USER}/nope/cours.pdf",
        f"{USER}/{OBJECT}/a%2Fb.pdf",
        f"{USER}/{OBJECT}/../cours.pdf",
        f"{USER}/{OBJECT}/",
        "",
    ],
)
def test_refuses_a_foreign_or_malformed_path(path: str) -> None:
    assert parse_owned_path(path, USER) is None


def test_refuses_a_non_uuid_owner_argument() -> None:
    assert parse_owned_path(f"{USER}/{OBJECT}/cours.pdf", "nope") is None
