"""[SPEC-2203] Upload limits, real type detection and Storage access.

The same bounds at their exact edge, the same real bytes, the same business codes and the same
problem+json status. Nothing here opens a socket: the Storage reader gets an `httpx.MockTransport`.
"""

import base64
import hashlib
import hmac
import json
import types
from collections.abc import Callable
from datetime import UTC, datetime
from functools import partial
from pathlib import Path
from typing import Any

import httpx
import pytest
from factories.files_support import build_image, build_pdf
from learny.content.application.resources import translate_limit_error, uploaded_event_id
from learny.content.domain.limits import (
    IMAGE_MAX_BYTES,
    NOTE_MAX_CHARS,
    PDF_MAX_BYTES,
    PDF_MAX_PAGES,
    USER_QUOTA_BYTES,
    Capacity,
    assert_capacity,
    assert_declared_upload,
    assert_file_size,
    assert_note_text,
    assert_pdf_pages,
    count_characters,
    kind_for_declared_mime,
)
from learny.content.infrastructure import objects
from learny.content.infrastructure.detect import detect_upload
from learny.content.infrastructure.objects import SupabaseObjectReader
from learny.platform.storage import mint_user_access_token
from learny.shared.clock import FixedClock
from learny.shared.errors import AppError, load_catalog, to_problem

pytestmark = pytest.mark.spec("SPEC-2203")

MEGABYTE = 1024 * 1024
USER = "11111111-1111-4111-8111-111111111111"
NOW = datetime(2026, 11, 11, 12, 20, tzinfo=UTC)
ROOT = Path(__file__).resolve().parents[5]
CATALOG = load_catalog(ROOT / "api" / "errors.json")


def code_of(run: Callable[[], object]) -> str:
    """The `AppError` code raised by `run`, or `OK` when it raises nothing."""
    try:
        run()
    except AppError as error:
        return error.code
    return "OK"


# --- PDF -----------------------------------------------------------------------------------------


def test_a_pdf_at_fifty_megabytes_and_five_hundred_pages_is_accepted() -> None:
    assert PDF_MAX_BYTES == 50 * MEGABYTE
    assert code_of(lambda: assert_file_size("pdf", PDF_MAX_BYTES)) == "OK"
    assert code_of(lambda: assert_file_size("pdf", PDF_MAX_BYTES + 1)) == "UPLOAD_TOO_LARGE"
    assert code_of(lambda: assert_pdf_pages(500)) == "OK"
    assert code_of(lambda: assert_pdf_pages(501)) == "UPLOAD_TOO_LARGE"

    detected = detect_upload(build_pdf(PDF_MAX_PAGES), "pdf")
    assert (detected.mime, detected.pages) == ("application/pdf", PDF_MAX_PAGES)
    assert code_of(lambda: detect_upload(build_pdf(501), "pdf")) == "UPLOAD_TOO_LARGE"


def test_the_pages_of_small_documents_are_counted() -> None:
    assert detect_upload(build_pdf(1), "pdf").pages == 1
    assert detect_upload(build_pdf(37), "pdf").pages == 37


def test_damaged_and_hostile_data_are_refused_as_an_unsupported_type() -> None:
    damaged = [
        b"%PDF-1.4 this is not a document",
        b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
        build_pdf(3)[:120],
    ]
    for payload in damaged:
        assert code_of(partial(detect_upload, payload, "pdf")) == "UNSUPPORTED_TYPE"


# --- image ---------------------------------------------------------------------------------------


def test_an_image_at_ten_megabytes_is_accepted() -> None:
    assert IMAGE_MAX_BYTES == 10 * MEGABYTE
    assert code_of(lambda: assert_file_size("image", IMAGE_MAX_BYTES)) == "OK"
    assert code_of(lambda: assert_file_size("image", IMAGE_MAX_BYTES + 1)) == "UPLOAD_TOO_LARGE"
    detected = detect_upload(build_image("png", IMAGE_MAX_BYTES), "image")
    assert (detected.mime, detected.pages) == ("image/png", None)


@pytest.mark.parametrize(
    ("format_name", "mime"),
    [("png", "image/png"), ("jpeg", "image/jpeg"), ("webp", "image/webp"), ("heic", "image/heic")],
)
def test_a_real_image_is_detected_from_its_signature(format_name: str, mime: str) -> None:
    detected = detect_upload(build_image(format_name), "image")

    assert (detected.mime, detected.pages) == (mime, None)


def test_an_executable_renamed_png_is_refused() -> None:
    executable = build_image("exe", 4096)

    assert code_of(lambda: detect_upload(executable, "image")) == "UNSUPPORTED_TYPE"
    assert code_of(lambda: detect_upload(executable, "pdf")) == "UNSUPPORTED_TYPE"


def test_an_image_format_outside_the_rules_and_a_text_file_are_refused() -> None:
    assert code_of(lambda: detect_upload(build_image("gif"), "image")) == "UNSUPPORTED_TYPE"
    text = b"# Titre\n\nUne note deguisee en image.\n"
    assert code_of(lambda: detect_upload(text, "image")) == "UNSUPPORTED_TYPE"
    assert code_of(lambda: detect_upload(b"", "image")) == "UNSUPPORTED_TYPE"


def test_a_content_that_does_not_match_the_declared_kind_is_refused() -> None:
    assert code_of(lambda: detect_upload(build_pdf(2), "image")) == "UNSUPPORTED_TYPE"
    assert code_of(lambda: detect_upload(build_image("png"), "pdf")) == "UNSUPPORTED_TYPE"


# --- note ----------------------------------------------------------------------------------------


def test_a_note_at_one_hundred_thousand_characters_is_accepted() -> None:
    assert NOTE_MAX_CHARS == 100_000
    assert code_of(lambda: assert_note_text("a" * 100_000)) == "OK"
    assert code_of(lambda: assert_note_text("a" * 100_001)) == "UPLOAD_TOO_LARGE"


def test_the_characters_are_counted_like_the_database() -> None:
    assert count_characters("\u00e9") == 1
    assert count_characters("\U0001f642\U0001f642") == 2
    assert code_of(lambda: assert_note_text("\U0001f642" * 100_000)) == "OK"
    assert code_of(lambda: assert_note_text("\U0001f642" * 100_001)) == "UPLOAD_TOO_LARGE"


# --- declared type -------------------------------------------------------------------------------


def test_a_declared_media_type_is_mapped_to_a_kind() -> None:
    assert kind_for_declared_mime("application/pdf") == "pdf"
    assert kind_for_declared_mime("Image/PNG; foo=bar") == "image"
    assert kind_for_declared_mime("image/heic") == "image"
    assert kind_for_declared_mime("image/jpeg") == "image"
    assert kind_for_declared_mime("image/webp") == "image"


def test_audio_video_and_everything_else_are_refused() -> None:
    for mime in ("audio/mpeg", "video/mp4", "application/zip", "text/plain", "image/gif", ""):
        assert code_of(partial(kind_for_declared_mime, mime)) == "UNSUPPORTED_TYPE"


def test_the_type_is_checked_before_the_size() -> None:
    assert code_of(lambda: assert_declared_upload("video/mp4", 10**12)) == "UNSUPPORTED_TYPE"
    assert code_of(lambda: assert_declared_upload("image/png", 11 * MEGABYTE)) == "UPLOAD_TOO_LARGE"


# --- capacity ------------------------------------------------------------------------------------


def test_the_101st_contribution_of_a_chapter_is_refused() -> None:
    assert code_of(lambda: assert_capacity(Capacity(99, 0, 0))) == "OK"
    assert code_of(lambda: assert_capacity(Capacity(100, 0, 0))) == "QUOTA_EXCEEDED"


def test_what_would_exceed_two_gigabytes_is_refused() -> None:
    assert USER_QUOTA_BYTES == 2 * 1024 * MEGABYTE
    assert code_of(lambda: assert_capacity(Capacity(0, USER_QUOTA_BYTES - 5, 5))) == "OK"
    assert code_of(lambda: assert_capacity(Capacity(0, USER_QUOTA_BYTES - 5, 6))) == "QUOTA_EXCEEDED"


# --- problem+json codes --------------------------------------------------------------------------


def test_the_business_codes_answer_a_422_with_an_explicit_message() -> None:
    cases: list[tuple[Callable[[], object], str]] = [
        (lambda: assert_file_size("pdf", PDF_MAX_BYTES + 1), "UPLOAD_TOO_LARGE"),
        (lambda: kind_for_declared_mime("application/x-msdownload"), "UNSUPPORTED_TYPE"),
        (lambda: assert_capacity(Capacity(100, 0, 0)), "QUOTA_EXCEEDED"),
    ]
    for run, expected in cases:
        with pytest.raises(AppError) as failure:
            run()
        problem = to_problem(failure.value, "req-12345678", CATALOG)
        assert problem["code"] == expected
        assert problem["status"] == 422
        assert len(str(problem["detail"])) > 20


def test_the_database_limit_triggers_give_the_same_codes() -> None:
    def triggered(message: str) -> BaseException:
        return translate_limit_error(ValueError(message))

    for message in ("chapter_resource_limit", "storage_quota_exceeded"):
        error = triggered(message)
        assert isinstance(error, AppError)
        assert error.code == "QUOTA_EXCEEDED"
    for message in ("resource_pdf_limit", "resource_image_limit"):
        error = triggered(message)
        assert isinstance(error, AppError)
        assert error.code == "UPLOAD_TOO_LARGE"
    constraint = triggered('violates check constraint "resources_pdf_pages"')
    assert isinstance(constraint, AppError)
    assert constraint.code == "UPLOAD_TOO_LARGE"
    unrelated = ValueError("connexion perdue")
    assert translate_limit_error(unrelated) is unrelated


# --- storage access ------------------------------------------------------------------------------


def base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def decode64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def test_a_short_lived_token_is_minted_for_one_learner() -> None:
    secret = "b" * 48
    clock = FixedClock(NOW)
    token = mint_user_access_token(USER, secret, clock)
    header, payload, signature = token.split(".")

    assert json.loads(decode64(header)) == {"alg": "HS256", "typ": "JWT"}
    claims = json.loads(decode64(payload))
    assert claims["sub"] == USER
    assert claims["role"] == "authenticated"
    assert claims["exp"] - claims["iat"] == 60
    expected = hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    assert signature == base64url(expected)
    assert code_of(lambda: mint_user_access_token(USER, "", clock)) == "SERVICE_UNAVAILABLE"


async def test_an_object_is_measured_and_read_with_a_hard_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    access_token = "token-du-test"

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        assert request.headers["authorization"] == f"Bearer {access_token}"
        if "missing" in str(request.url):
            return httpx.Response(400, json={"statusCode": "404", "error": "not_found"})
        if "/object/info/" in str(request.url):
            return httpx.Response(200, json={"size": 5, "etag": '"abc"', "name": "not-read"})
        return httpx.Response(200, content=b"\x01\x02\x03\x04\x05", headers={"etag": '"abc"'})

    def factory(**kwargs: Any) -> httpx.AsyncClient:
        kwargs["transport"] = httpx.MockTransport(handler)
        return httpx.AsyncClient(**kwargs)

    monkeypatch.setattr(
        objects, "httpx", types.SimpleNamespace(AsyncClient=factory, HTTPError=httpx.HTTPError)
    )
    reader = SupabaseObjectReader("http://storage.test/", "cle-publique")

    info = await reader.info("u/r/guide final.pdf", access_token)
    assert info is not None
    assert (info.size, info.etag) == (5, '"abc"')
    assert calls[0] == (
        "http://storage.test/storage/v1/object/info/authenticated/resources/u/r/guide%20final.pdf"
    )

    content = await reader.read("u/r/guide.pdf", access_token, 5)
    assert content is not None
    assert (content.data, content.etag) == (b"\x01\x02\x03\x04\x05", '"abc"')

    with pytest.raises(AppError) as failure:
        await reader.read("u/r/guide.pdf", access_token, 4)
    assert failure.value.code == "UPLOAD_TOO_LARGE"
    assert await reader.info("u/missing/x.pdf", access_token) is None
    assert await reader.read("u/missing/x.pdf", access_token, 5) is None


def test_the_uploaded_event_identifier_is_stable() -> None:
    assert uploaded_event_id("33333333-3333-4333-8333-333333333333") == (
        "resource-uploaded:33333333-3333-4333-8333-333333333333"
    )
    assert hashlib.sha256(b"abc").hexdigest() == (
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
