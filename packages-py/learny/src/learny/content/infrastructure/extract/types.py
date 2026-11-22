"""Common shape returned by every extractor (SPEC-509 EF-2; SPEC-510 reuses it).

Port of `packages/ingestion/src/extract/types.ts`: absolute character ranges in `text`, optional
page/offset/anchor attributes, the extracted title and the provenance of a model reading.
"""

from dataclasses import dataclass, field
from typing import Any

from learny.content.domain.chunk import SourceLocation
from learny.content.domain.limits import NOTE_MAX_CHARS, PDF_MAX_BYTES, PDF_MAX_PAGES


@dataclass(frozen=True, slots=True)
class VisionOrigin:
    """The `light` model that read an image."""

    provider: str
    model_id: str
    task: str = "light"


@dataclass(frozen=True, slots=True)
class ExtractedContent:
    """Text the passages are cut from, with its exact locations and provenance."""

    text: str
    pages: int | None
    locations: tuple[SourceLocation, ...]
    title: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    content_origin: str | None = None
    vision: VisionOrigin | None = None


@dataclass(frozen=True, slots=True)
class PdfLimits:
    """PDF extractor limits, read from the product constants (BR-APP-02)."""

    max_bytes: int = PDF_MAX_BYTES
    max_pages: int = PDF_MAX_PAGES
    note_max_characters: int = NOTE_MAX_CHARS


__all__ = ["ExtractedContent", "PdfLimits", "VisionOrigin"]
