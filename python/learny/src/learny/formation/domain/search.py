"""Plain-text snippets and highlight positions of the global search (SPEC-212 EF-4, ET-3, ET-4).

A snippet is plain text of at most 160 characters, ellipses included, centred on the first match,
and never contains markup. Highlight ranges are half-open `[start, end[` **UTF-16 units** of the
returned text, computed on the folded text so case and accents never matter, and never split a
surrogate pair or a combining sequence.
"""

import re
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any

from learny.shared.locale_fr.details import ELLIPSIS

SEARCH_SNIPPET_MAX_LENGTH = 160
SEARCH_GROUP_LABELS = {
    "notion": "Notions",
    "chapter": "Chapitres",
    "formation": "Formations",
}
SEARCH_KINDS = ("notion", "chapter", "formation")

WORD_SNAP = 15
_BLOCK_TAGS = re.compile(
    r"</?(?:address|article|aside|blockquote|body|br|dd|details|div|dl|dt|figcaption|figure|footer"
    r"|h[1-6]|header|hr|html|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr"
    r"|ul)\b[^>]*>",
    re.IGNORECASE,
)


def normalize_query(value: str) -> str:
    """EF-1 - NFKC, collapsed whitespace, trim (`normalizeSearchText` of the contract)."""
    return " ".join(unicodedata.normalize("NFKC", value).split())


def fold_code_point(code_point: str) -> str:
    """Folds one code point: lower case, canonical decomposition, diacritics removed."""
    return "".join(
        char for char in unicodedata.normalize("NFD", code_point.lower()) if not unicodedata.combining(char)
    )


def fold(text: str) -> str:
    """ET-3 - NFD, diacritics removed, lower case: `fold('Reseau')` is `'reseau'`."""
    return "".join(fold_code_point(code_point) for code_point in text)


def query_terms(query: str) -> list[str]:
    """The words the highlighter looks for: folded, deduplicated; short words only as a last resort."""
    words = list(dict.fromkeys(word for word in fold(normalize_query(query)).split(" ") if word))
    long_words = [word for word in words if len(word) >= 2]
    return long_words or words


def _units(text: str) -> list[int]:
    """UTF-16 code units of `text`, the unit the contract's offsets use."""
    encoded = text.encode("utf-16-le", "surrogatepass")
    return [int.from_bytes(encoded[index : index + 2], "little") for index in range(0, len(encoded), 2)]


def _from_units(units: Sequence[int]) -> str:
    raw = b"".join(int(unit).to_bytes(2, "little") for unit in units)
    return raw.decode("utf-16-le", "surrogatepass")


def _fold_with_map(text: str) -> tuple[list[int], list[int], list[int]]:
    """Folds `text` code point by code point, remembering the source range of every folded unit."""
    folded: list[int] = []
    starts: list[int] = []
    ends: list[int] = []
    last_char_first_unit = -1
    index = 0
    for code_point in text:
        next_index = index + len(_units(code_point))
        piece = _units(fold_code_point(code_point))
        if not piece:
            unit = last_char_first_unit
            while 0 <= unit < len(ends):
                ends[unit] = next_index
                unit += 1
        else:
            last_char_first_unit = len(starts)
            for unit_value in piece:
                starts.append(index)
                ends.append(next_index)
                folded.append(unit_value)
        index = next_index
    return folded, starts, ends


def _find_all(haystack: Sequence[int], needle: Sequence[int]) -> list[int]:
    """Every index where `needle` occurs in `haystack`."""
    found: list[int] = []
    width = len(needle)
    if width == 0:
        return found
    from_index = 0
    while True:
        at = -1
        for candidate in range(from_index, len(haystack) - width + 1):
            if list(haystack[candidate : candidate + width]) == list(needle):
                at = candidate
                break
        if at < 0:
            return found
        found.append(at)
        from_index = at + width


def compute_highlights(text: str, query: str) -> list[dict[str, int]]:
    """ET-3 - merged `[start, end[` ranges of every query word in `text`, ignoring case and accents."""
    terms = query_terms(query)
    if not terms:
        return []
    normalised = unicodedata.normalize("NFC", text)
    folded, starts, ends = _fold_with_map(normalised)
    found: list[dict[str, int]] = []
    for term in terms:
        term_units = _units(term)
        for at in _find_all(folded, term_units):
            first = starts[at]
            last = ends[at + len(term_units) - 1]
            if last > first:
                found.append({"start": first, "end": last})
    found.sort(key=lambda item: (item["start"], -item["end"]))
    merged: list[dict[str, int]] = []
    for item in found:
        if merged and item["start"] <= merged[-1]["end"]:
            merged[-1]["end"] = max(merged[-1]["end"], item["end"])
        else:
            merged.append(dict(item))
    return merged


def strip_markup(text: str) -> str:
    """Removes comments, script and style blocks, then tags; a block tag separates words."""
    without_comments = re.sub(r"<!--[\s\S]*?-->", " ", text)
    without_scripts = re.sub(r"<(script|style)\b[\s\S]*?</\1\s*>", " ", without_comments, flags=re.I)
    without_blocks = _BLOCK_TAGS.sub(" ", without_scripts)
    return re.sub(r"</?[A-Za-z!?][^>]*>", "", without_blocks)


def to_plain_text(value: str | None) -> str:
    """ET-4 - removes whatever could be taken for markup, then collapses whitespace (NFC)."""
    text = strip_markup(unicodedata.normalize("NFC", value or ""))
    text = re.sub(r"^[ \t]*(`{3,}|~{3,})[^\n]*$", " ", text, flags=re.MULTILINE)
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"\[([^\]]*)\]\[[^\]]*\]", r"\1", text)
    text = re.sub(r"^[ \t]*\[[^\]]+\]:[ \t]*\S+.*$", " ", text, flags=re.MULTILINE)
    text = re.sub(r"^[ \t]{0,3}#{1,6}[ \t]+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[ \t]*>+[ \t]?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[ \t]*[-*+][ \t]+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[ \t]*\d+[.)][ \t]+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^[ \t]*([-*_][ \t]*){3,}$", " ", text, flags=re.MULTILINE)
    text = re.sub(
        r"^[ \t]*\|?[ \t]*:?-{2,}:?([ \t]*\|[ \t]*:?-{2,}:?)*[ \t]*\|?[ \t]*$",
        " ",
        text,
        flags=re.MULTILINE,
    )
    text = text.replace("|", " ")
    text = re.sub(r"(\*\*|__)(?=\S)([\s\S]*?\S)\1", r"\2", text)
    text = re.sub(r"(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)", r"\1\2", text)
    text = re.sub(r"(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)", r"\1\2", text)
    text = re.sub(r"~~(?=\S)([\s\S]*?\S)~~", r"\1", text)
    text = re.sub(r"`+", "", text)
    text = re.sub(r"&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);", " ", text, flags=re.I)
    text = re.sub(r"[<>]", " ", text)
    return unicodedata.normalize("NFC", " ".join(text.split()))


def to_plain_title(value: str | None) -> str:
    """A title is a short plain text: markup characters go, Markdown syntax is left alone."""
    text = strip_markup(unicodedata.normalize("NFC", value or ""))
    text = re.sub(r"&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);", " ", text, flags=re.I)
    text = re.sub(r"[<>]", " ", text)
    return " ".join(text.split())


def _is_whitespace(unit: int | None) -> bool:
    return unit is None or chr(unit).isspace()


def _is_low_surrogate(unit: int | None) -> bool:
    return unit is not None and 0xDC00 <= unit <= 0xDFFF


def _is_high_surrogate(unit: int | None) -> bool:
    return unit is not None and 0xD800 <= unit <= 0xDBFF


def _is_combining(unit: int | None) -> bool:
    return unit is not None and unicodedata.combining(chr(unit)) != 0


def _window_around(units: Sequence[int], anchor: Mapping[str, int] | None, maximum: int) -> dict[str, Any]:
    """`windowAround`: `maximum` units centred on the anchor, cuts moved to a word boundary."""
    length = len(units)
    anchor_start = 0 if anchor is None else int(anchor["start"])
    anchor_end = 0 if anchor is None else min(int(anchor["end"]), anchor_start + maximum - 2)
    lead = False
    trail = False
    start = 0
    end = min(length, maximum)
    for _ in range(3):
        budget = maximum - (1 if lead else 0) - (1 if trail else 0)
        start = max(0, anchor_start - (budget - (anchor_end - anchor_start)) // 2)
        end = start + budget
        if end > length:
            end = length
            start = max(0, end - budget)
        next_lead = start > 0
        next_trail = end < length
        if next_lead == lead and next_trail == trail:
            break
        lead = next_lead
        trail = next_trail
    lead = start > 0
    trail = end < length

    if lead and not _is_whitespace(units[start - 1]) and not _is_whitespace(units[start]):
        space = _index_of(units, 0x20, start)
        if space >= 0 and space - start <= WORD_SNAP and space + 1 <= anchor_start:
            start = space + 1
    if trail and not _is_whitespace(units[end]) and not _is_whitespace(units[end - 1]):
        space = _last_index_of(units, 0x20, end - 1)
        if space >= 0 and end - space <= WORD_SNAP and space >= anchor_end:
            end = space
    if lead:
        while start < end and (_is_low_surrogate(units[start]) or _is_combining(units[start])):
            start += 1
    if trail and end > start and _is_high_surrogate(units[end - 1]):
        end -= 1
    return {"start": start, "end": end, "lead": start > 0, "trail": end < length}


def _index_of(units: Sequence[int], value: int, start: int) -> int:
    for index in range(start, len(units)):
        if units[index] == value:
            return index
    return -1


def _last_index_of(units: Sequence[int], value: int, start: int) -> int:
    for index in range(min(start, len(units) - 1), -1, -1):
        if units[index] == value:
            return index
    return -1


def build_snippet(source: str | None, query: str) -> dict[str, Any]:
    """EF-4, ET-4, CL-7 - the plain-text snippet and its highlights, centred on the first match."""
    plain = to_plain_text(source)
    maximum = SEARCH_SNIPPET_MAX_LENGTH
    if len(plain) <= maximum:
        return {"snippet": plain, "highlights": compute_highlights(plain, query)}
    units = _units(plain)
    first = compute_highlights(plain, query)
    cut = _window_around(units, first[0] if first else None, maximum)
    body = _from_units(units[cut["start"] : cut["end"]]).strip()
    snippet = f"{ELLIPSIS if cut['lead'] else ''}{body}{ELLIPSIS if cut['trail'] else ''}"
    return {"snippet": snippet, "highlights": compute_highlights(snippet, query)}
