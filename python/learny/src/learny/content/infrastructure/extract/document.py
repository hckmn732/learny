"""Document extractor of simple mode (SPEC-4001 EF-2).

Unlike a PDF, a text document has no page coordinates: the whole text is one located passage and the
detected sections come from its headings. A DOCX is read from `word/document.xml` of the ZIP archive
without executing anything, TXT and Markdown are decoded as UTF-8; the same rules as the programme
import apply (binary guard, bounded text, cleaned line endings).
"""

import io
import re
import zipfile

from learny.content.domain.errors import IngestionError
from learny.content.infrastructure.extract.types import ExtractedContent
from learny.shared.locale_fr import content as texts

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TEXT_MAX_CHARS = 2_000_000
_REPLACEMENT = re.compile("\ufffd")


def _clean(raw: str) -> str:
    without_bom = raw.lstrip("\ufeff")
    if "\u0000" in without_bom:
        raise IngestionError("EXTRACTION_FAILED", texts.NOT_A_DOCUMENT)
    normalised = re.sub(r"\r\n?", "\n", without_bom)
    normalised = re.sub(r"[ \t]+\n", "\n", normalised)
    normalised = re.sub(r"\n{4,}", "\n\n\n", normalised).strip()
    if normalised == "":
        raise IngestionError("EXTRACTION_FAILED", texts.DOCUMENT_EMPTY)
    if len(normalised) > TEXT_MAX_CHARS:
        normalised = normalised[:TEXT_MAX_CHARS]
    replacements = len(_REPLACEMENT.findall(normalised))
    if replacements > len(normalised) * 0.02:
        raise IngestionError("EXTRACTION_FAILED", texts.NOT_A_DOCUMENT)
    return normalised


def _docx_text(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml = archive.read("word/document.xml").decode("utf-8")
    except (zipfile.BadZipFile, KeyError, OSError):
        raise IngestionError("EXTRACTION_FAILED", texts.NOT_A_DOCUMENT) from None
    without_tags = re.sub(r"<[^>]+>", "", xml.replace("</w:p>", "\n").replace("<w:tab/>", "\t"))
    return without_tags.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")


def _title_of(text: str) -> str | None:
    for line in text.splitlines():
        candidate = " ".join(line.split())
        if candidate != "":
            return candidate[:160]
    return None


def extract_document(data: bytes, mime: str) -> ExtractedContent:
    """EF-2 - the whole text of a DOCX, TXT or Markdown document, as one located passage."""
    if len(data) == 0:
        raise IngestionError("EXTRACTION_FAILED", texts.DOCUMENT_EMPTY)
    raw = _docx_text(data) if mime == DOCX_MIME else data.decode("utf-8", errors="replace")
    text = _clean(raw)
    from learny.content.domain.chunk import SourceLocation

    return ExtractedContent(
        text=text,
        pages=None,
        locations=(SourceLocation(char_start=0, char_end=len(text)),),
        title=_title_of(text),
    )


__all__ = ["DOCX_MIME", "extract_document"]
