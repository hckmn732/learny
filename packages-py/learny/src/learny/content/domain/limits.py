"""Upload rules of BR-APP-02 (SPEC-206 EF-6, ET-2, CL-1 to CL-3, ADR-0039)."""

from dataclasses import dataclass

from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts

PDF_MAX_BYTES = 52_428_800
PDF_MAX_PAGES = 500
IMAGE_MAX_BYTES = 10_485_760
NOTE_MAX_CHARS = 100_000
PER_CHAPTER = 100
USER_QUOTA_BYTES = 2_147_483_648

IMAGE_MIME_TYPES = ("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif")
PDF_MIME_TYPE = "application/pdf"
MEGABYTE = 1024 * 1024


def _group_thousands(value: int) -> str:
    return f"{value:,}".replace(",", " ")


def _format_megabytes(size: int) -> str:
    return f"{round(size / MEGABYTE)} Mo"


def size_limit_bytes(kind: str) -> int:
    """The bound of a file kind: 50 MB for a PDF, 10 MB for an image."""
    return PDF_MAX_BYTES if kind == "pdf" else IMAGE_MAX_BYTES


def normalize_mime(mime: str) -> str:
    """Media type without its parameters, lower-cased."""
    return mime.split(";")[0].strip().lower()


def kind_for_declared_mime(mime: str) -> str:
    """The kind a declared media type announces; audio and video are refused in V1."""
    media_type = normalize_mime(mime)
    if media_type == PDF_MIME_TYPE:
        return "pdf"
    if media_type in IMAGE_MIME_TYPES:
        return "image"
    if media_type.startswith("audio/") or media_type.startswith("video/"):
        raise AppError("UNSUPPORTED_TYPE", texts.UNSUPPORTED_TYPE_AUDIO)
    raise AppError("UNSUPPORTED_TYPE", texts.UNSUPPORTED_TYPE)


def assert_file_size(kind: str, size_bytes: int) -> None:
    """CL-1, CL-2: a file up to the bound is accepted, one byte beyond is refused."""
    limit = size_limit_bytes(kind)
    if size_bytes > limit:
        subject = "Un PDF" if kind == "pdf" else "Une image"
        raise AppError(
            "UPLOAD_TOO_LARGE",
            texts.UPLOAD_TOO_LARGE.format(subject=subject, limit=_format_megabytes(limit)),
        )


def assert_pdf_pages(pages: int) -> None:
    """CL-1: 500 pages exactly are accepted, 501 are refused."""
    if pages > PDF_MAX_PAGES:
        raise AppError("UPLOAD_TOO_LARGE", texts.UPLOAD_TOO_MANY_PAGES.format(pages=PDF_MAX_PAGES))


def count_characters(text: str) -> int:
    """Characters as the database counts them (`char_length`): one per code point."""
    return len(text)


def assert_note_text(text: str) -> None:
    """EF-3: 100 000 characters exactly are accepted."""
    if count_characters(text) > NOTE_MAX_CHARS:
        raise AppError(
            "UPLOAD_TOO_LARGE",
            texts.NOTE_TOO_LARGE.format(limit=_group_thousands(NOTE_MAX_CHARS)),
        )


@dataclass(frozen=True, slots=True)
class Capacity:
    """The three bounds a new contribution must fit in."""

    chapter_count: int
    used_bytes: float
    added_bytes: int


def assert_capacity(capacity: Capacity) -> None:
    """EF-6, CL-3: 100 contributions per chapter and 2 GB per learner."""
    if capacity.chapter_count >= PER_CHAPTER:
        raise AppError("QUOTA_EXCEEDED", texts.QUOTA_CHAPTER_FULL.format(limit=PER_CHAPTER))
    if capacity.used_bytes + capacity.added_bytes > USER_QUOTA_BYTES:
        limit = USER_QUOTA_BYTES // (MEGABYTE * 1024)
        raise AppError("QUOTA_EXCEEDED", texts.QUOTA_STORAGE_FULL.format(limit=limit))


def assert_declared_upload(mime: str, size_bytes: int) -> str:
    """Declared values of an upload request: type first, then size. Returns the kind."""
    kind = kind_for_declared_mime(mime)
    assert_file_size(kind, size_bytes)
    return kind
