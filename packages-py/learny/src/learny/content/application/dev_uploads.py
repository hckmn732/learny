"""Demonstration of the upload limits (SPEC-206 EF-7).

Port of `packages/services/src/dev/uploads.ts`. The simulated sizes go through the very checks of the
real flow (`assert_declared_upload`, `assert_pdf_pages`, `assert_capacity`, `detect_upload`) without
creating a file, a row or a blob; a refusal raises the same `AppError` as the real service.
"""

from typing import Any

from learny.content.domain.limits import (
    IMAGE_MAX_BYTES,
    PDF_MAX_BYTES,
    PDF_MAX_PAGES,
    PDF_MIME_TYPE,
    USER_QUOTA_BYTES,
    Capacity,
    assert_capacity,
    assert_declared_upload,
    assert_note_text,
    assert_pdf_pages,
)
from learny.content.infrastructure.detect import detect_upload

MEGABYTE = 1024 * 1024
# `MZ` header of a Windows executable: the hostile content behind a `.png` name (CL-2).
EXECUTABLE_BYTES = bytes(
    [0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00]
)


def _evaluate(
    mime: str,
    size_bytes: int,
    pages: int | None,
    added_bytes: int,
    *,
    chapter_count: int = 0,
    used_bytes: float = 0,
) -> str:
    """`evaluateUpload`: declared type and size, page count, then the capacity of the chapter."""
    kind = assert_declared_upload(mime, size_bytes)
    if kind == "pdf" and pages is not None:
        assert_pdf_pages(pages)
    assert_capacity(Capacity(chapter_count=chapter_count, used_bytes=used_bytes, added_bytes=added_bytes))
    return kind


async def simulate_upload(case: str) -> dict[str, Any]:
    """`simulateUpload`: the accepted shape of a case, or the refusal of the real service."""
    if case == "pdf-limit":
        size_bytes = PDF_MAX_BYTES
        pages: int | None = PDF_MAX_PAGES
        kind = _evaluate(PDF_MIME_TYPE, size_bytes, pages, size_bytes)
        return _accepted(case, kind, size_bytes, pages)
    if case == "pdf-too-many-pages":
        size_bytes = 12 * MEGABYTE
        pages = PDF_MAX_PAGES + 1
        _evaluate(PDF_MIME_TYPE, size_bytes, pages, size_bytes)
        return _accepted(case, "pdf", size_bytes, pages)
    if case == "image-limit":
        size_bytes = IMAGE_MAX_BYTES
        kind = _evaluate("image/png", size_bytes, None, size_bytes)
        return _accepted(case, kind, size_bytes, None)
    if case == "image-too-large":
        size_bytes = IMAGE_MAX_BYTES + 1
        _evaluate("image/png", size_bytes, None, size_bytes)
        return _accepted(case, "image", size_bytes, None)
    if case == "executable-as-png":
        # Declared as a PNG, but the real bytes are a Windows executable.
        detect_upload(EXECUTABLE_BYTES, "image")
        return _accepted(case, "image", len(EXECUTABLE_BYTES), None)
    if case == "note-too-long":
        assert_note_text("x" * 100_001)
        return _accepted(case, "image", 0, None)
    if case == "chapter-full":
        size_bytes = MEGABYTE
        _evaluate(PDF_MIME_TYPE, size_bytes, None, size_bytes, chapter_count=100)
        return _accepted(case, "pdf", size_bytes, None)
    size_bytes = 10 * MEGABYTE
    _evaluate(
        PDF_MIME_TYPE,
        size_bytes,
        None,
        size_bytes,
        used_bytes=float(USER_QUOTA_BYTES - MEGABYTE),
    )
    return _accepted(case, "pdf", size_bytes, None)


def _accepted(case: str, kind: str, size_bytes: int, pages: int | None) -> dict[str, Any]:
    return {
        "case": case,
        "accepted": True,
        "kind": kind,
        "sizeBytes": size_bytes,
        "pages": pages,
    }
