"""Verification of the citations of a generated course (SPEC-608 EF-2, ET-4, CL-4).

The pure function works on a snapshot of the owner's passages, so a citation is valid only when the
chunk exists, belongs to the learner and to the chapter, and its resource is still ready and not
deleted. The generation pipeline calls it twice (after generation and just before publishing), so a
passage deleted between the two reads can never be published (ADR-0039). No IO, no clock.
"""

from collections.abc import Collection, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from learny.shared.locale_fr import content as texts

CitationIssueCode = Literal[
    "missing",
    "foreign",
    "other_chapter",
    "deleted",
    "not_ready",
    "outside_context",
]


@dataclass(frozen=True, slots=True)
class KnownChunk:
    """One passage of the owner's snapshot, as the verification sees it."""

    chunk_id: str
    owner_id: str
    chapter_id: str | None
    resource_id: str
    resource_title: str
    resource_kind: str
    resource_status: str
    resource_deleted: bool
    resource_mime: str | None
    text: str
    location: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class CitationIssue:
    """One refused citation, with the contract code and its user-facing message."""

    code: CitationIssueCode
    chapter_id: str
    section_index: int
    chunk_id: str
    message: str


@dataclass(frozen=True, slots=True)
class ResolvedCitation:
    """One accepted citation, bound to the section that carries it."""

    chapter_id: str
    section_index: int
    section_kind: str
    chunk: KnownChunk


@dataclass(frozen=True, slots=True)
class CitationValidation:
    """The outcome: complete citations, or the issues that forbid publishing."""

    ok: bool
    citations: tuple[ResolvedCitation, ...]
    issues: tuple[CitationIssue, ...]


def _message_of(code: CitationIssueCode) -> str:
    return {
        "missing": texts.CITATION_MISSING,
        "foreign": texts.CITATION_FOREIGN,
        "other_chapter": texts.CITATION_OTHER_CHAPTER,
        "deleted": texts.CITATION_DELETED,
        "not_ready": texts.CITATION_NOT_READY,
        "outside_context": texts.CITATION_OUTSIDE_CONTEXT,
    }[code]


def _sources_of(section: Mapping[str, Any]) -> Sequence[str]:
    """The chunk ids a section cites; a `tutor_addition` carries none (schema rule)."""
    value = section.get("sourceChunkIds")
    if not isinstance(value, list):
        return []
    return [entry for entry in value if isinstance(entry, str)]


def _code_of(
    chunk: KnownChunk | None,
    *,
    user_id: str,
    chapter_id: str,
    allowed_chunk_ids: Collection[str],
) -> CitationIssueCode | None:
    """The first rule a citation breaks, in the resolver order."""
    if chunk is None:
        return "missing"
    if chunk.owner_id != user_id:
        return "foreign"
    if chunk.chapter_id != chapter_id:
        return "other_chapter"
    if chunk.resource_deleted:
        return "deleted"
    if chunk.resource_status != "ready":
        return "not_ready"
    if chunk.chunk_id not in allowed_chunk_ids:
        return "outside_context"
    return None


def validate_course_citations(
    draft: Mapping[str, Any],
    *,
    user_id: str,
    chunks: Mapping[str, KnownChunk],
    allowed_chunk_ids: Collection[str],
) -> CitationValidation:
    """EF-2, CL-4: resolves every `chunkId` of the draft against the owner's ready passages."""
    issues: list[CitationIssue] = []
    citations: list[ResolvedCitation] = []
    chapters = draft.get("chapters")
    for chapter in chapters if isinstance(chapters, list) else []:
        if not isinstance(chapter, Mapping):
            continue
        chapter_id = str(chapter.get("chapterId") or "")
        sections = chapter.get("sections")
        for section_index, section in enumerate(sections if isinstance(sections, list) else []):
            if not isinstance(section, Mapping):
                continue
            for chunk_id in _sources_of(section):
                chunk = chunks.get(chunk_id)
                code = _code_of(
                    chunk,
                    user_id=user_id,
                    chapter_id=chapter_id,
                    allowed_chunk_ids=allowed_chunk_ids,
                )
                if code is not None:
                    issues.append(
                        CitationIssue(
                            code=code,
                            chapter_id=chapter_id,
                            section_index=section_index,
                            chunk_id=chunk_id,
                            message=_message_of(code),
                        )
                    )
                    continue
                if chunk is None:  # pragma: no cover - `missing` is returned above
                    continue
                citations.append(
                    ResolvedCitation(
                        chapter_id=chapter_id,
                        section_index=section_index,
                        section_kind=str(section.get("kind") or ""),
                        chunk=chunk,
                    )
                )
    return CitationValidation(
        ok=not issues,
        citations=tuple(citations),
        issues=tuple(issues),
    )


def citation_failure_summary(issues: Sequence[CitationIssue]) -> str:
    """A failed verification is an invalid model output: no version is published."""
    return "; ".join(f"{issue.code}: {issue.chunk_id}" for issue in issues[:8])


__all__ = [
    "CitationIssue",
    "CitationIssueCode",
    "CitationValidation",
    "KnownChunk",
    "ResolvedCitation",
    "citation_failure_summary",
    "validate_course_citations",
]
