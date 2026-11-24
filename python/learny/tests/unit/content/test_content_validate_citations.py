"""[SPEC-2203] Verification of the citations of a generated course.

The same draft, the same passage fixtures and the same expected issue codes, case by case. The
resolver is pure, so no database is involved.
"""

from typing import Any

import pytest
from learny.content.domain.citations import (
    CitationIssue,
    CitationValidation,
    KnownChunk,
    citation_failure_summary,
    validate_course_citations,
)

pytestmark = pytest.mark.spec("SPEC-2203")

USER = "11111111-1111-4111-8111-111111111111"
OTHER_USER = "22222222-2222-4222-8222-222222222222"
CHAPTER = "33333333-3333-4333-8333-333333333333"
OTHER_CHAPTER = "44444444-4444-4444-8444-444444444444"
CHUNK = "55555555-5555-4555-8555-555555555555"
NOTION = "66666666-6666-4666-8666-666666666666"
RESOURCE = "77777777-7777-4777-8777-777777777777"


def chunk(**overrides: Any) -> KnownChunk:
    values: dict[str, Any] = {
        "chunk_id": CHUNK,
        "owner_id": USER,
        "chapter_id": CHAPTER,
        "resource_id": RESOURCE,
        "resource_title": "Guide utilisateur FI",
        "resource_kind": "pdf",
        "resource_status": "ready",
        "resource_deleted": False,
        "resource_mime": "application/pdf",
        "text": "Une piece reunit un en-tete et des postes.",
        "location": {"page": 4, "charStart": 0, "charEnd": 42},
    }
    values.update(overrides)
    return KnownChunk(**values)


def draft_with_source(kind: str = "markdown") -> dict[str, Any]:
    """The draft of the reference fixture, section for section."""
    if kind == "markdown":
        sections: list[dict[str, Any]] = [
            {
                "kind": "markdown",
                "title": "Introduction",
                "contentMd": "Une piece reunit un en-tete et des postes.",
                "sourceChunkIds": [CHUNK],
                "notionIds": [NOTION],
            },
            {
                "kind": "takeaway",
                "points": ["Un", "Deux", "Trois"],
                "sourceChunkIds": [],
                "notionIds": [],
            },
        ]
        chapter_sources: list[str] = [CHUNK]
        notions: list[str] = [NOTION]
        suggestions: list[dict[str, Any]] = []
    else:
        sections = [
            {
                "kind": "tutor_addition",
                "title": "Bases",
                "contentMd": "Le tuteur presente la notion.",
                "notionIds": [],
            },
            {
                "kind": "takeaway",
                "points": ["Un", "Deux", "Trois"],
                "sourceChunkIds": [],
                "notionIds": [],
            },
        ]
        chapter_sources = []
        notions = []
        suggestions = [
            {"title": "Guide officiel", "url": "https://example.com/guide", "reason": "Pour demarrer."}
        ]
    return {
        "chapters": [
            {
                "chapterId": CHAPTER,
                "title": "Saisie des pieces comptables",
                "baseCourse": kind == "tutor_addition",
                "sections": sections,
                "sourceChunkIds": chapter_sources,
                "notionIds": notions,
                "links": [],
                "resourceSuggestions": suggestions,
            }
        ]
    }


def verify(known: KnownChunk, allowed: tuple[str, ...] = (CHUNK,)) -> CitationValidation:
    return validate_course_citations(
        draft_with_source(),
        user_id=USER,
        chunks={known.chunk_id: known},
        allowed_chunk_ids=set(allowed),
    )


def first_issue(known: KnownChunk, allowed: tuple[str, ...] = (CHUNK,)) -> CitationIssue:
    result = verify(known, allowed)
    assert result.ok is False
    assert result.issues
    return result.issues[0]


def test_a_ready_passage_of_the_owner_and_of_its_chapter_is_resolved() -> None:
    result = verify(chunk())

    assert result.ok is True
    assert len(result.citations) == 1
    assert result.citations[0].chunk.chunk_id == CHUNK
    assert result.citations[0].chunk.location["page"] == 4
    assert result.issues == ()


def test_a_missing_passage_is_refused() -> None:
    issue = first_issue(chunk(chunk_id="88888888-8888-4888-8888-888888888888"))

    assert issue.code == "missing"
    assert issue.chunk_id == CHUNK


def test_a_deleted_passage_is_refused() -> None:
    assert first_issue(chunk(resource_deleted=True)).code == "deleted"


def test_another_learners_passage_is_refused() -> None:
    assert first_issue(chunk(owner_id=OTHER_USER)).code == "foreign"


def test_a_passage_of_another_chapter_is_refused() -> None:
    assert first_issue(chunk(chapter_id=OTHER_CHAPTER)).code == "other_chapter"


def test_a_passage_outside_the_context_sent_to_the_tutor_is_refused() -> None:
    assert first_issue(chunk(), ()).code == "outside_context"


def test_a_tutor_addition_without_citation_is_accepted() -> None:
    result = validate_course_citations(
        draft_with_source("tutor_addition"),
        user_id=USER,
        chunks={},
        allowed_chunk_ids=set(),
    )

    assert result.ok is True
    assert result.citations == ()


def test_the_failure_summary_names_the_first_issues() -> None:
    issues = [CitationIssue("missing", CHAPTER, 0, f"chunk-{index}", "refused") for index in range(10)]

    summary = citation_failure_summary(issues)

    assert summary.count(";") == 7
    assert summary.startswith("missing: chunk-0")
    assert "chunk-8" not in summary
