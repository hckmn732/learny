"""Section detection of the course document (SPEC-4001 EF-7, CL-2; ADR-4003 D7).

The order of preference is fixed: PDF bookmarks, table of contents, detected headings, then a plain
split in blocks of fifteen pages. The result never fails: a document without any structure still
gives usable sections. Bookmarks are read by `pypdf` during ingestion and stored in the resource
metadata, so the analysis never opens the file again.
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

FALLBACK_PAGES = 15
MAX_SECTIONS = 100
HEADING_MAX_LENGTH = 120

_TOC_HEADING = re.compile(
    r"^\s*(sommaire|table des mati\u00e8res|contents|table of contents)\s*[.:]?\s*$", re.IGNORECASE
)
# `Chapitre 3. La cellule : structure et fonction. 21`: number, optional title, optional page.
_CHAPTER_LINE = re.compile(
    r"^\s*(?:chapitre|chapter)\s+(?P<number>\d{1,3})\b\s*[.:\u2014-]?\s*(?P<title>.*?)\s*(?P<page>\d{1,4})?\s*$",
    re.IGNORECASE,
)
# A chapter announced by the table of contents needs at least this many chapters to be trusted.
MIN_CHAPTERS = 2
CHAPTER_LINE_MAX = 90
_TOC_LINE = re.compile(r"^(?P<title>.{3,120}?)[\s.\u00b7]{2,}(?P<page>\d{1,4})\s*$")
_HEADING = re.compile(
    r"^\s*(?:(?:chapitre|chapter|partie|part|section|module)\s+[\w.-]+"
    r"|(?:\d+\.)+\d*\s+\S.{0,100})(?:\s+\S.{0,100})?\s*$",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class DocumentSection:
    """One detected section, with the page range it covers and its text."""

    position: int
    title: str
    page_from: int | None
    page_to: int | None
    text: str


def _chunk_page(chunk: Mapping[str, object]) -> int | None:
    location = chunk.get("location")
    if not isinstance(location, Mapping):
        return None
    page = location.get("page")
    return int(page) if isinstance(page, int) and page >= 1 else None


def page_texts(chunks: Sequence[Mapping[str, object]]) -> dict[int, str]:
    """The text of every page, in page order, from the located passages."""
    pages: dict[int, list[str]] = {}
    for chunk in chunks:
        page = _chunk_page(chunk)
        if page is None:
            continue
        text = chunk.get("text")
        if isinstance(text, str):
            pages.setdefault(page, []).append(text)
    return {page: "\n".join(parts) for page, parts in sorted(pages.items())}


def _pages_from_texts(pages: Mapping[int, str]) -> int | None:
    return max(pages) if pages else None


def _page_of_title(title: str, pages: Mapping[int, str]) -> int | None:
    needle = " ".join(title.lower().split())
    for page, text in pages.items():
        if needle != "" and needle in " ".join(text.lower().split()):
            return page
    return None


def _title_from_text(text: str) -> str:
    for line in text.splitlines():
        candidate = " ".join(line.split())
        if candidate != "":
            return candidate[:HEADING_MAX_LENGTH]
    return ""


def table_of_contents(pages: Mapping[int, str]) -> list[tuple[int, str]]:
    """A table of contents read from the first pages: title lines ending with a page number."""
    entries: list[tuple[int, str]] = []
    for _page, text in list(pages.items())[:5]:
        lines = text.splitlines()
        for index, line in enumerate(lines):
            if _TOC_HEADING.match(line) is None:
                continue
            for entry_line in lines[index + 1 : index + 60]:
                match = _TOC_LINE.match(entry_line.strip())
                if match is None:
                    continue
                title = " ".join(match.group("title").split())
                number = int(match.group("page"))
                if title != "" and number >= 1:
                    entries.append((number, title))
    return entries


def headings(pages: Mapping[int, str]) -> list[tuple[int, str]]:
    """Heading-like lines, mapped to the page that holds them."""
    found: list[tuple[int, str]] = []
    for page, text in pages.items():
        for line in text.splitlines():
            stripped = " ".join(line.split())
            if len(stripped) < 3 or len(stripped) > HEADING_MAX_LENGTH:
                continue
            if _HEADING.match(stripped) is None:
                continue
            found.append((page, stripped))
    return found


def _sections_from_boundaries(
    boundaries: Sequence[tuple[int, str]], pages: Mapping[int, str], total: int | None
) -> list[DocumentSection]:
    ordered = sorted(boundaries, key=lambda entry: (entry[0], entry[1]))
    deduped: list[tuple[int, str]] = []
    for page, title in ordered:
        if deduped and deduped[-1][0] == page:
            continue
        deduped.append((page, title))
    sections: list[DocumentSection] = []
    for index, (page, title) in enumerate(deduped):
        next_page = deduped[index + 1][0] if index + 1 < len(deduped) else (total or page)
        page_to = max(page, next_page - 1) if index + 1 < len(deduped) else max(page, total or page)
        text = "\n".join(text for number, text in pages.items() if page <= number <= page_to)
        sections.append(
            DocumentSection(
                position=index + 1,
                title=title.strip()[:HEADING_MAX_LENGTH] or _title_from_text(text),
                page_from=page,
                page_to=page_to,
                text=text,
            )
        )
    return sections


def _fallback(pages: Mapping[int, str], total: int | None, plain_text: str = "") -> list[DocumentSection]:
    if not pages or total is None:
        text = "\n".join(pages.values()) or plain_text
        if text.strip() == "":
            return []
        return [
            DocumentSection(
                position=1,
                title=_title_from_text(text),
                page_from=None,
                page_to=None,
                text=text,
            )
        ]
    sections: list[DocumentSection] = []
    last_page = total or 0
    for start in range(1, last_page + 1, FALLBACK_PAGES):
        end = min(start + FALLBACK_PAGES - 1, last_page)
        text = "\n".join(text for number, text in pages.items() if start <= number <= end)
        sections.append(
            DocumentSection(
                position=len(sections) + 1,
                title=_title_from_text(text),
                page_from=start,
                page_to=end,
                text=text,
            )
        )
    return sections


def toc_pages(pages: Mapping[int, str]) -> set[int]:
    """Pages of the table of contents: the page of a `Sommaire` heading and the pages after it that
    still list chapters. They structure the document and never become a section (QA 2026-11-26)."""
    found: set[int] = set()
    ordered = sorted(pages)
    for index, page in enumerate(ordered):
        lines = pages[page].splitlines()
        if not any(_TOC_HEADING.match(line) for line in lines):
            continue
        found.add(page)
        for following in ordered[index + 1 :]:
            listed = sum(1 for line in pages[following].splitlines() if _CHAPTER_LINE.match(line))
            if listed < 2:
                break
            found.add(following)
    return found


def _clean_title(title: str) -> str:
    cleaned = " ".join(title.split()).strip(" .:\u2014-")
    return cleaned[:HEADING_MAX_LENGTH]


def _numbered(line: str, match: "re.Match[str]", name: str) -> str:
    """The chapter line as written (`Chapitre 1 Les bases`), its trailing page number removed."""
    label = line[: match.start("title")] if match.group("title") else line
    return _clean_title(f"{' '.join(label.split())} {name}") if name else _clean_title(label)


def chapter_titles(pages: Mapping[int, str], toc: set[int]) -> dict[int, str]:
    """`Chapitre N. Title` lines of the table of contents: the title of every numbered chapter."""
    titles: dict[int, str] = {}
    for page in sorted(toc):
        for line in pages[page].splitlines():
            match = _CHAPTER_LINE.match(line)
            if match is None:
                continue
            number = int(match.group("number"))
            name = _clean_title(match.group("title") or "")
            if name and number not in titles:
                titles[number] = _numbered(line, match, name)
    return titles


def chapter_starts(pages: Mapping[int, str], toc: set[int]) -> list[tuple[int, str]]:
    """The body page where each numbered chapter begins, titled from the table of contents."""
    titles = chapter_titles(pages, toc)
    starts: dict[int, tuple[int, str]] = {}
    for page in sorted(pages):
        if page in toc:
            continue
        lines = [line for line in pages[page].splitlines() if line.strip()]
        for index, line in enumerate(lines):
            # A chapter may start mid-page (after the answers of the previous exercises); a short
            # line keeps a sentence that merely begins with "Chapitre" out.
            if len(line.strip()) > CHAPTER_LINE_MAX:
                continue
            match = _CHAPTER_LINE.match(line)
            if match is None:
                continue
            number = int(match.group("number"))
            if number in starts:
                break
            name = _clean_title(match.group("title") or "")
            own = _numbered(line, match, name) if name else ""
            if not own and index + 1 < len(lines):
                following = _clean_title(lines[index + 1])
                own = f"Chapitre {number}. {following}"[:HEADING_MAX_LENGTH] if following else ""
            title = titles.get(number) or own or f"Chapitre {number}"
            starts[number] = (page, title)
            break
    ordered = [starts[number] for number in sorted(starts)]
    # A chapter that starts before the previous one is a cross-reference, not a start.
    kept: list[tuple[int, str]] = []
    for page, title in ordered:
        if kept and page <= kept[-1][0]:
            continue
        kept.append((page, title))
    return kept


def _without_toc(sections: list[DocumentSection], toc: set[int]) -> list[DocumentSection]:
    """Drops the sections that are only the table of contents, then renumbers them."""
    kept = [
        section
        for section in sections
        if not (
            _TOC_HEADING.match(section.title)
            or (
                section.page_from is not None
                and section.page_to is not None
                and toc
                and all(
                    page in toc or page < min(toc)
                    for page in range(section.page_from, section.page_to + 1)
                )
            )
        )
    ]
    if not kept:
        return sections
    return [
        DocumentSection(
            position=index + 1,
            title=section.title,
            page_from=section.page_from,
            page_to=section.page_to,
            text=section.text,
        )
        for index, section in enumerate(kept)
    ]


def detect_sections(
    chunks: Sequence[Mapping[str, object]],
    *,
    bookmarks: Sequence[tuple[int, str]] | None = None,
    total_pages: int | None = None,
) -> list[DocumentSection]:
    """EF-7 - bookmarks, table of contents, headings, then blocks of fifteen pages (CL-2)."""
    pages = page_texts(chunks)
    total = total_pages if total_pages is not None else _pages_from_texts(pages)
    usable = [(int(page), str(title)) for page, title in (bookmarks or []) if int(page) >= 1]
    toc_set = toc_pages(pages)
    chapters = chapter_starts(pages, toc_set)
    if len(usable) >= 2:
        sections = _sections_from_boundaries(usable, pages, total)
    elif len(chapters) >= MIN_CHAPTERS:
        # The numbered chapters announced by the table of contents: the pages before the first
        # one (cover, table of contents) belong to no section.
        sections = _sections_from_boundaries(chapters, pages, total)
    else:
        toc = table_of_contents(pages)
        if len(toc) >= 2:
            sections = _sections_from_boundaries(toc, pages, total)
        else:
            found = headings(pages)
            if len(found) >= 2:
                sections = _sections_from_boundaries(found, pages, total)
            else:
                plain = "\n".join(
                    str(chunk.get("text")) for chunk in chunks if isinstance(chunk.get("text"), str)
                )
                sections = _fallback(pages, total, plain)
    return _without_toc(sections, toc_set)[:MAX_SECTIONS]


def read_pdf_bookmarks(data: bytes) -> list[tuple[int, str]]:
    """The PDF outline as `(page, title)`, read by `pypdf` without rendering the document."""
    import io

    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        outline = reader.outline
    except Exception:
        return []
    entries: list[tuple[int, str]] = []
    try:
        for item in outline:
            if isinstance(item, list):
                continue
            title = getattr(item, "title", None)
            raw_page = reader.get_destination_page_number(item)
            page_number = (raw_page or 0) + 1
            if isinstance(title, str) and title.strip() != "" and page_number >= 1:
                entries.append((page_number, " ".join(title.split())))
    except Exception:
        return entries
    return entries


__all__ = [
    "FALLBACK_PAGES",
    "DocumentSection",
    "detect_sections",
    "headings",
    "page_texts",
    "read_pdf_bookmarks",
    "table_of_contents",
]
