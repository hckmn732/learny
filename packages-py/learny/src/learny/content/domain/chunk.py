"""Paragraph-aware splitting of an extracted contribution (SPEC-509 ET-2, EF-3, CA-1).

The function is pure and deterministic: the same text and locations always produce the same
passages. A passage never crosses a source location (page for a PDF), always ends on a paragraph
boundary when possible, keeps an exact `{charStart, charEnd}` range and repeats the trailing units
of the previous passage as overlap.

`estimateTokens` counts JavaScript string units: `Math.ceil(text.length / 4)` where `length` is the
number of UTF-16 code units, so an astral character counts for two here as it does in Node.
"""

import re
from dataclasses import dataclass
from typing import Any

from learny.content.domain.errors import IngestionError
from learny.shared.locale_fr import content as texts

TARGET_TOKENS = 800
OVERLAP_TOKENS = 100
CHARACTERS_PER_TOKEN = 4
MAX_LOCATION_CHAR_END = 2_000_000
MAX_LOCATIONS = 1000
MAX_ANCHOR_LENGTH = 200
MIN_TARGET_TOKENS = 20
MAX_TARGET_TOKENS = 4000
MAX_OVERLAP_TOKENS = 3999

# The `\s` class of ECMAScript 262
JS_SPACE = frozenset(
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009"
    "\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
)
PARAGRAPH_BREAK = re.compile(r"\r?\n+")


@dataclass(frozen=True, slots=True)
class SourceLocation:
    """One source range the passages are cut from; offsets are absolute in the text."""

    char_start: int
    char_end: int
    page: int | None = None
    anchor: str | None = None
    start_sec: float | None = None
    end_sec: float | None = None


@dataclass(frozen=True, slots=True)
class TextChunk:
    """One passage with its exact source location and its estimated cost."""

    position: int
    text: str
    location: dict[str, Any]
    token_count: int


@dataclass(frozen=True, slots=True)
class Unit:
    """A paragraph, or the part of a paragraph that fits the target, with its cost."""

    start: int
    end: int
    tokens: int


def js_length(text: str) -> int:
    """Length of a JavaScript string: one unit per UTF-16 code unit."""
    if text.isascii():
        return len(text)
    return len(text.encode("utf-16-le")) // 2


def estimate_tokens(text: str) -> int:
    """`estimateTokens` of `@learny/llm`: one token per four JavaScript characters."""
    return -(-js_length(text) // CHARACTERS_PER_TOKEN)


def _is_space(character: str) -> bool:
    return character in JS_SPACE


def _trim_range(text: str, start: int, end: int) -> tuple[int, int] | None:
    """Adjusts a range to remove surrounding whitespace while keeping exact offsets."""
    left = start
    right = end
    while left < right and _is_space(text[left]):
        left += 1
    while right > left and _is_space(text[right - 1]):
        right -= 1
    return (left, right) if right > left else None


def _split_long_range(text: str, start: int, end: int, max_chars: int) -> list[Unit]:
    """Splits a paragraph at the last sentence or word boundary that fits."""
    units: list[Unit] = []
    cursor = start
    half = max_chars / 2
    while cursor < end:
        candidate = min(cursor + max_chars, end)
        if candidate < end:
            window = text[cursor:candidate]
            sentence = max(window.rfind(". "), window.rfind("! "), window.rfind("? "))
            word = window.rfind(" ")
            if sentence >= half:
                cut = sentence + 1
            elif word >= half:
                cut = word
            else:
                cut = len(window)
            candidate = cursor + cut
        trimmed = _trim_range(text, cursor, candidate)
        if trimmed is not None:
            units.append(
                Unit(
                    start=trimmed[0],
                    end=trimmed[1],
                    tokens=estimate_tokens(text[trimmed[0] : trimmed[1]]),
                )
            )
        cursor = candidate if candidate > cursor else cursor + 1
    return units


def _units_of_location(text: str, location: SourceLocation, max_chars: int) -> list[Unit]:
    """Paragraph units of one source location, the largest ones split to fit the target."""
    units: list[Unit] = []
    source = text[location.char_start : location.char_end]
    if source.strip() == "":
        return units
    max_tokens = max_chars // CHARACTERS_PER_TOKEN
    paragraph_start = 0

    def add_paragraph(start: int, end: int) -> None:
        trimmed = _trim_range(text, location.char_start + start, location.char_start + end)
        if trimmed is None:
            return
        entry = Unit(
            start=trimmed[0],
            end=trimmed[1],
            tokens=estimate_tokens(text[trimmed[0] : trimmed[1]]),
        )
        if entry.tokens <= max_tokens:
            units.append(entry)
            return
        units.extend(_split_long_range(text, trimmed[0], trimmed[1], max_chars))

    for match in PARAGRAPH_BREAK.finditer(source):
        add_paragraph(paragraph_start, match.start())
        paragraph_start = match.start() + len(match.group(0))
    add_paragraph(paragraph_start, len(source))
    return units


def _location_for(origin: SourceLocation, start: int, end: int) -> dict[str, Any]:
    """The exact `{charStart, charEnd}` range, plus the source attributes of the location."""
    location: dict[str, Any] = {"charStart": start, "charEnd": end}
    if origin.page is not None:
        location["page"] = origin.page
    if origin.anchor is not None:
        location["anchor"] = origin.anchor
    if origin.start_sec is not None:
        location["startSec"] = origin.start_sec
    if origin.end_sec is not None:
        location["endSec"] = origin.end_sec
    return location


def _validate(text: str, locations: list[SourceLocation] | None, overlap: int, target: int) -> None:
    """The strict input checks of `ChunkTextInput` (SPEC-509 ET-2)."""
    if text == "" or js_length(text) > MAX_LOCATION_CHAR_END:
        raise IngestionError("TEXT_EMPTY", texts.CHUNK_INPUT_INVALID)
    if not MIN_TARGET_TOKENS <= target <= MAX_TARGET_TOKENS:
        raise IngestionError("TEXT_EMPTY", texts.CHUNK_INPUT_INVALID)
    if not 0 <= overlap <= MAX_OVERLAP_TOKENS:
        raise IngestionError("TEXT_EMPTY", texts.CHUNK_INPUT_INVALID)
    if locations is None:
        return
    if len(locations) == 0 or len(locations) > MAX_LOCATIONS:
        raise IngestionError("TEXT_EMPTY", texts.CHUNK_INPUT_INVALID)
    for location in locations:
        if location.char_end <= location.char_start:
            raise IngestionError("TEXT_EMPTY", texts.CHUNK_INPUT_INVALID)
        if location.page is not None and location.page < 1:
            raise IngestionError("TEXT_EMPTY", texts.CHUNK_INPUT_INVALID)
        if location.anchor is not None and js_length(location.anchor) > MAX_ANCHOR_LENGTH:
            raise IngestionError("TEXT_EMPTY", texts.CHUNK_INPUT_INVALID)
        if (location.start_sec is not None and location.start_sec < 0) or (
            location.end_sec is not None and location.end_sec < 0
        ):
            raise IngestionError("TEXT_EMPTY", texts.CHUNK_INPUT_INVALID)


def chunk_text(
    text: str,
    locations: list[SourceLocation] | None = None,
    target_tokens: int = TARGET_TOKENS,
    overlap_tokens: int = OVERLAP_TOKENS,
) -> list[TextChunk]:
    """ET-2: splits `text` into `target_tokens` passages with `overlap_tokens` of overlap."""
    _validate(text, locations, overlap_tokens, target_tokens)
    if overlap_tokens >= target_tokens:
        raise IngestionError("TEXT_EMPTY", texts.CHUNK_OVERLAP_TOO_LARGE)
    source_locations = locations
    if source_locations is None:
        source_locations = [SourceLocation(char_start=0, char_end=len(text))]
    for location in source_locations:
        if location.char_end > len(text):
            raise IngestionError("TEXT_EMPTY", texts.CHUNK_LOCATION_TOO_LONG)

    chunks: list[TextChunk] = []
    max_chars = target_tokens * CHARACTERS_PER_TOKEN
    for location in source_locations:
        units = _units_of_location(text, location, max_chars)
        start = 0
        while start < len(units):
            end = start
            tokens = 0
            while end < len(units):
                unit = units[end]
                if end > start and tokens + unit.tokens > target_tokens:
                    break
                tokens += unit.tokens
                end += 1
            if end == start:
                end = start + 1
            first = units[start]
            last = units[end - 1]
            value = text[first.start : last.end]
            chunks.append(
                TextChunk(
                    position=len(chunks),
                    text=value,
                    location=_location_for(location, first.start, last.end),
                    token_count=estimate_tokens(value),
                )
            )
            if end >= len(units):
                break

            # Overlap: reuse trailing units of the passage, but never the whole passage. When no
            # paragraph fits under the token budget, the last one still overlaps (about 100 tokens).
            overlap_start = end
            overlap = 0
            while overlap_start > start:
                candidate = units[overlap_start - 1]
                if overlap + candidate.tokens >= tokens:
                    break
                if overlap > 0 and overlap + candidate.tokens > overlap_tokens:
                    break
                overlap += candidate.tokens
                overlap_start -= 1
            start = overlap_start if overlap_start < end else end

    if not chunks:
        raise IngestionError("TEXT_EMPTY", texts.CHUNK_NO_PASSAGE)
    return chunks


def excerpt_of(text: str, char_start: int, char_end: int) -> str:
    """Deterministic excerpt of a passage, used by citations and the demonstration (BR-APP-06)."""
    return text[char_start:char_end]
