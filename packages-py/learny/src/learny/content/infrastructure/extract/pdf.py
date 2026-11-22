"""PDF extractor (SPEC-509 EF-2, ET-2, CL-1, CL-2; ADR-0057).

Port of `packages/ingestion/src/extract/pdf.ts` on `pypdf`: no rendering and no embedded script
execution. A password-protected document, a damaged file, a page beyond BR-APP-02 or a document
without any text becomes a safe, named failure and never a partial set of passages. The page
coordinates are preserved so a citation always points to the exact page and character range.
"""

import io

from learny.content.domain.chunk import SourceLocation
from learny.content.domain.errors import IngestionError
from learny.content.infrastructure.extract.types import ExtractedContent, PdfLimits
from learny.shared.locale_fr import content as texts

DEFAULT_PDF_LIMITS = PdfLimits()


def _parse_error() -> IngestionError:
    return IngestionError("PDF_CORRUPTED", texts.PDF_EXTRACT_CORRUPTED)


def extract_pdf(
    data: bytes,
    limits: PdfLimits = DEFAULT_PDF_LIMITS,
) -> ExtractedContent:
    """EF-2: extracts the text of a PDF page by page.

    `text` concatenates the pages with two newlines and every page location gives the absolute
    `{char_start, char_end}` of its text.
    """
    from pypdf import PdfReader
    from pypdf.errors import FileNotDecryptedError, PdfReadError

    if len(data) > limits.max_bytes:
        raise IngestionError(
            "PDF_TOO_LARGE",
            texts.PDF_EXTRACT_TOO_LARGE.format(limit=limits.max_bytes // 1_048_576),
        )
    if len(data) == 0:
        raise IngestionError("PDF_CORRUPTED", texts.PDF_EXTRACT_EMPTY)

    page_count = 0
    text = ""
    locations: list[SourceLocation] = []
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and reader.decrypt("") == 0:
            raise IngestionError("PDF_ENCRYPTED", texts.PDF_EXTRACT_ENCRYPTED)
        page_count = len(reader.pages)
        if page_count > limits.max_pages:
            raise IngestionError(
                "PDF_TOO_MANY_PAGES", texts.PDF_EXTRACT_TOO_MANY_PAGES.format(pages=limits.max_pages)
            )
        for index in range(page_count):
            page_text = reader.pages[index].extract_text() or ""
            if page_text.strip() != "":
                char_start = len(text)
                text += page_text
                locations.append(SourceLocation(char_start=char_start, char_end=len(text), page=index + 1))
            if index < page_count - 1:
                text += "\n\n"
    except IngestionError:
        raise
    except FileNotDecryptedError as error:
        raise IngestionError("PDF_ENCRYPTED", texts.PDF_EXTRACT_ENCRYPTED) from error
    except (PdfReadError, ValueError, OSError, KeyError, TypeError) as error:
        raise _parse_error() from error

    if not locations:
        raise IngestionError("PDF_EMPTY_TEXT", texts.PDF_EXTRACT_EMPTY_TEXT)
    return ExtractedContent(text=text, pages=page_count, locations=tuple(locations))


__all__ = ["DEFAULT_PDF_LIMITS", "extract_pdf"]
