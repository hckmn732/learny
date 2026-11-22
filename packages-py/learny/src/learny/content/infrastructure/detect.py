"""Real type and page count of an uploaded file (SPEC-206 ET-2, CL-2).

Port of `packages/services/src/resources/detect.ts`: the media type is read from the first bytes,
never from the extension or from the announced `Content-Type`, and the pages of a PDF are counted by
`pypdf`, which only opens the document (no rendering, no embedded script).
"""

import io
from dataclasses import dataclass
from typing import Final

from learny.content.domain.limits import (
    IMAGE_MIME_TYPES,
    PDF_MIME_TYPE,
    assert_pdf_pages,
)
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts

# Signatures of BR-APP-02 (`file-type` reads the same bytes).
PNG_SIGNATURE: Final = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE: Final = b"\xff\xd8\xff"
HEIF_BRANDS: Final = (b"heic", b"heix", b"hevc", b"hevx", b"mif1", b"msf1", b"heif")


@dataclass(frozen=True, slots=True)
class DetectedFile:
    """The real media type and the page count of a PDF."""

    mime: str
    pages: int | None


def detect_mime(data: bytes) -> str | None:
    """The media type read from the signature, or `None` for anything else."""
    if data.startswith(b"%PDF-"):
        return PDF_MIME_TYPE
    if data.startswith(JPEG_SIGNATURE):
        return "image/jpeg"
    if data.startswith(PNG_SIGNATURE):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in HEIF_BRANDS:
        return "image/heic"
    return None


def count_pdf_pages(data: bytes) -> int:
    """Pages of a PDF; a protected or damaged document is refused with a stable code."""
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise AppError("UNSUPPORTED_TYPE", texts.PDF_PASSWORD_PROTECTED)
        return len(reader.pages)
    except AppError:
        raise
    except (PdfReadError, ValueError, OSError):
        raise AppError("UNSUPPORTED_TYPE", texts.PDF_UNREADABLE) from None


def detect_upload(data: bytes, kind: str) -> DetectedFile:
    """EF-2: checks the real bytes against the kind the resource was created for."""
    mime = detect_mime(data)
    if kind == "pdf":
        if mime != PDF_MIME_TYPE:
            if mime is None or mime not in IMAGE_MIME_TYPES:
                raise AppError("UNSUPPORTED_TYPE", texts.NOT_A_PDF)
            raise AppError("UNSUPPORTED_TYPE", texts.CONTENT_TYPE_MISMATCH)
        pages = count_pdf_pages(data)
        if pages < 1:
            raise AppError("UNSUPPORTED_TYPE", texts.PDF_WITHOUT_PAGE)
        assert_pdf_pages(pages)
        return DetectedFile(mime=mime, pages=pages)
    if mime is None or mime not in IMAGE_MIME_TYPES:
        if mime == PDF_MIME_TYPE:
            raise AppError("UNSUPPORTED_TYPE", texts.CONTENT_TYPE_MISMATCH)
        raise AppError("UNSUPPORTED_TYPE", texts.NOT_AN_IMAGE)
    return DetectedFile(mime=mime, pages=None)
