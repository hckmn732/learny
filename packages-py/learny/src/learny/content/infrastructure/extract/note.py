"""Note extractor (SPEC-509 EF-2, ET-2).

A note is already text, so nothing is normalised and every character range stays true to the
learner's contribution. An empty note or a note beyond the coded limit is a permanent, readable
failure.
"""

from learny.content.domain.chunk import SourceLocation
from learny.content.domain.errors import IngestionError
from learny.content.domain.limits import NOTE_MAX_CHARS
from learny.content.infrastructure.extract.types import ExtractedContent
from learny.shared.locale_fr import content as texts


def extract_note(content: str | None) -> ExtractedContent:
    """EF-2: the text of a note with one exact location covering it."""
    if content is None or content.strip() == "":
        raise IngestionError("NOTE_EMPTY", texts.NOTE_EMPTY)
    if len(content) > NOTE_MAX_CHARS:
        raise IngestionError("NOTE_TOO_LARGE", texts.NOTE_TOO_LARGE_EXTRACT.format(limit=NOTE_MAX_CHARS))
    return ExtractedContent(
        text=content,
        pages=None,
        locations=(SourceLocation(char_start=0, char_end=len(content)),),
    )


__all__ = ["extract_note"]
