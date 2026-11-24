"""[SPEC-4001] Section detection: bookmarks, table of contents, headings, 15-page fallback (EF-7)."""

import pytest
from learny.content.application.section_detection import (
    FALLBACK_PAGES,
    detect_sections,
    headings,
    page_texts,
    table_of_contents,
)

pytestmark = pytest.mark.spec("SPEC-4001")


def chunk(page: int, text: str) -> dict[str, object]:
    return {
        "position": page,
        "text": text,
        "location": {"page": page, "charStart": 0, "charEnd": len(text)},
    }


def pages(count: int) -> list[dict[str, object]]:
    return [chunk(index, f"Contenu de la page {index} du document.") for index in range(1, count + 1)]


def test_bookmarks_give_the_sections_and_their_pages() -> None:
    sections = detect_sections(
        pages(6),
        bookmarks=[(1, "Introduction"), (3, "Comptabilite generale"), (5, "Conclusion")],
    )
    assert [section.title for section in sections] == [
        "Introduction",
        "Comptabilite generale",
        "Conclusion",
    ]
    assert [(section.page_from, section.page_to) for section in sections] == [
        (1, 2),
        (3, 4),
        (5, 6),
    ]


def test_a_table_of_contents_gives_the_sections() -> None:
    chunks = pages(6)
    chunks[0] = chunk(1, "Sommaire\nChapitre 1 ........ 2\nChapitre 2 ........ 4")
    entries = table_of_contents(page_texts(chunks))
    assert entries == [(2, "Chapitre 1"), (4, "Chapitre 2")]
    sections = detect_sections(chunks)
    assert [section.title for section in sections] == ["Chapitre 1", "Chapitre 2"]
    assert sections[0].page_from == 2


def test_headings_are_used_when_no_bookmark_nor_contents_exist() -> None:
    chunks = [
        chunk(1, "Chapitre 1 Les bases"),
        chunk(2, "du texte"),
        chunk(3, "Chapitre 2 Approfondissement"),
    ]
    found = headings(page_texts(chunks))
    assert [title for _, title in found] == [
        "Chapitre 1 Les bases",
        "Chapitre 2 Approfondissement",
    ]
    sections = detect_sections(chunks)
    assert len(sections) == 2
    assert sections[0].title == "Chapitre 1 Les bases"


def test_without_any_structure_the_document_is_cut_in_fifteen_page_blocks() -> None:
    sections = detect_sections(pages(40))
    assert len(sections) == 3
    assert sections[0].page_from == 1 and sections[0].page_to == FALLBACK_PAGES
    assert sections[2].page_from == 31 and sections[2].page_to == 40


def test_a_document_without_pages_gives_one_section() -> None:
    sections = detect_sections([{"position": 0, "text": "Un document sans pagination.", "location": {}}])
    assert len(sections) == 1
    assert sections[0].page_from is None
    assert "pagination" in sections[0].text


def test_no_chunk_never_crashes_the_detection() -> None:
    assert detect_sections([]) == []
