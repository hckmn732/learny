"""Extraction of an imported programme (SPEC-605 EF-2, CL-1).

The original bytes never leave the server: the service keeps them in
`programme_imports.original_content` and only the extracted text goes to the tutor. PDF uses `pypdf`
(ADR-2015), DOCX reads `word/document.xml` of the ZIP archive without executing anything, TXT and
Markdown are UTF-8 text.
"""

import base64
import binascii
import io
import re
import zipfile
from collections.abc import Mapping
from typing import Any

from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    EXTRACTION_BINARY,
    EXTRACTION_DOCX_EMPTY,
    EXTRACTION_EMPTY_FILE,
    EXTRACTION_NOT_UTF8,
    EXTRACTION_PDF_CORRUPT,
    EXTRACTION_PDF_EMPTY,
    EXTRACTION_TEXT_BINARY,
    EXTRACTION_UNSUPPORTED,
    EXTRACTION_ZIP_CORRUPT,
    PAYLOAD_TOO_LARGE_FILE,
    PAYLOAD_TOO_LARGE_TEXT,
    TEXT_EMPTY,
)

TEXT_LIMIT = 200_000
FILE_LIMIT = 700_000
_REPLACEMENT = re.compile("\ufffd")


def _extraction_failed(detail: str) -> AppError:
    return AppError("EXTRACTION_FAILED", detail, status=422)


def _unsupported() -> AppError:
    return AppError("UNSUPPORTED_TYPE", EXTRACTION_UNSUPPORTED, status=422)


def _decode_base64(value: str) -> bytes:
    compact = re.sub(r"\s+", "", value)
    if compact == "":
        raise _extraction_failed(EXTRACTION_EMPTY_FILE)
    try:
        decoded = base64.b64decode(compact, validate=True)
    except (binascii.Error, ValueError) as error:
        raise _extraction_failed(EXTRACTION_EMPTY_FILE) from error
    if not decoded:
        raise _extraction_failed(EXTRACTION_EMPTY_FILE)
    if len(decoded) > FILE_LIMIT:
        raise AppError("PAYLOAD_TOO_LARGE", PAYLOAD_TOO_LARGE_FILE, status=413)
    return decoded


def clean_text(raw: str) -> str:
    """`cleanText`: BOM, binary NUL, line endings, trailing blanks and empty text."""
    without_bom = raw.lstrip("\ufeff")
    if "\u0000" in without_bom:
        raise _extraction_failed(EXTRACTION_BINARY)
    normalised = re.sub(r"\r\n?", "\n", without_bom)
    normalised = re.sub(r"[ \t]+\n", "\n", normalised)
    normalised = re.sub(r"\n{4,}", "\n\n\n", normalised).strip()
    if normalised == "":
        raise AppError("TEXT_EMPTY", TEXT_EMPTY, status=422)
    if len(normalised) > TEXT_LIMIT:
        raise AppError("PAYLOAD_TOO_LARGE", PAYLOAD_TOO_LARGE_TEXT, status=413)
    replacements = len(_REPLACEMENT.findall(normalised))
    if replacements > len(normalised) * 0.02:
        raise _extraction_failed(EXTRACTION_NOT_UTF8)
    return normalised


def _decode_text(data: bytes) -> str:
    text = data.decode("utf-8", errors="replace")
    controls = sum(1 for char in text if (ord(char) < 32 and char not in "\t\n\r") or ord(char) == 127)
    if controls > max(4, len(text) * 0.02):
        raise _extraction_failed(EXTRACTION_TEXT_BINARY)
    return clean_text(text)


def _xml_text(xml: str) -> str:
    return clean_text(
        xml.replace("</w:p>", "\n")
        .replace("<w:tab/>", "\t")
        .replace("<w:br/>", "\n")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&amp;", "&")
    )


def _docx_document_xml(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            return archive.read("word/document.xml").decode("utf-8")
    except KeyError as error:
        raise _extraction_failed(EXTRACTION_DOCX_EMPTY) from error
    except (zipfile.BadZipFile, OSError) as error:
        raise _extraction_failed(EXTRACTION_ZIP_CORRUPT) from error
    except UnicodeDecodeError as error:
        raise _extraction_failed(EXTRACTION_NOT_UTF8) from error


def _docx_text(data: bytes) -> str:
    xml = _docx_document_xml(data)
    return _xml_text(re.sub(r"<[^>]+>", "", xml))


def _pdf_text(data: bytes) -> str:
    if data[:4] != b"%PDF":
        raise _extraction_failed(EXTRACTION_PDF_CORRUPT)
    try:
        from pypdf import PdfReader
    except ImportError as error:  # pragma: no cover - the dependency is pinned by ADR-2015
        raise _extraction_failed(EXTRACTION_PDF_CORRUPT) from error
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as error:  # pypdf raises its own exceptions on a corrupt document
        raise _extraction_failed(EXTRACTION_PDF_CORRUPT) from error
    text = "\n\n".join(pages)
    if text.strip() == "":
        raise _extraction_failed(EXTRACTION_PDF_EMPTY)
    return clean_text(text)


def _extension_of(filename: str) -> str:
    index = filename.rfind(".")
    return "" if index == -1 else filename[index + 1 :].lower()


def extract_programme_text(body: Mapping[str, Any]) -> dict[str, Any]:
    """`extractProgrammeText`: the readable programme text, or a safe business error."""
    kind = str(body.get("kind"))
    if kind == "text":
        text = clean_text(str(body.get("text") or ""))
        return {
            "kind": "text",
            "text": text,
            "filename": None,
            "originalContent": None,
            "originalSize": None,
        }
    content = str(body.get("contentBase64") or "")
    data = _decode_base64(content)
    filename = str(body.get("filename") or "")
    extension = _extension_of(filename)
    if extension == "pdf":
        text = _pdf_text(data)
    elif extension == "docx":
        text = _docx_text(data)
    elif extension in ("txt", "md", "markdown"):
        text = _decode_text(data)
    else:
        raise _unsupported()
    return {
        "kind": "file",
        "text": text,
        "filename": filename,
        "originalContent": re.sub(r"\s+", "", content),
        "originalSize": len(data),
    }
