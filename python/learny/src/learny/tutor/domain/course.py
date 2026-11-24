"""Course generation: the pure rules of the module-to-course pipeline (SPEC-608, SPEC-2207).

The section kind written in the database, the anchor of a section, its data and its text, the media
of a citation, the passages selected inside the course context budget, the validation and the
normalisation of one chapter draft, the ordered ends of a notion link, and the deterministic
identifiers of the version and of the two notifications. No IO, no clock, no model call.
"""

import json
import re
import unicodedata
from collections.abc import Collection, Mapping, Sequence
from typing import Any, Final

from learny.content.domain.chunk import estimate_tokens
from learny.content.domain.citations import KnownChunk, ResolvedCitation
from learny.content.domain.retrieval import RETRIEVAL_TOKEN_BUDGETS, format_document_chunk
from learny.shared.errors import AppError
from learny.shared.locale_fr import tutor as texts

COURSE_TASK: Final = "course"
COURSE_PROMPT_ID: Final = "course.course"
COURSE_PROMPT_VERSION: Final = 1
COURSE_MAX_CORRECTIONS: Final = 2
"""SPEC-608 EF-1 - the initial call and its two corrections."""

COURSE_TOKEN_BUDGET: Final = RETRIEVAL_TOKEN_BUDGETS["course"]
"""`ai.md` section 3 - the passages of one chapter fit this budget, tags included."""

COURSE_SCENARIO_SOURCED: Final = "course-sourced"
COURSE_SCENARIO_BASE: Final = "course-base"

GENERATION_KEY_MAX_LENGTH: Final = 200
NOT_JSON_CORRECTION: Final = "the answer was not valid JSON"
CORRECTION_TEMPLATE: Final = (
    "Correction: the previous answer violated the CourseChapterDraft contract ({reason}). "
    "Return one valid complete chapter now."
)

SECTION_KINDS: Final = (
    "markdown",
    "quick_question",
    "comparison",
    "tutor_addition",
    "takeaway",
    "summary_prompt",
)
LINK_KINDS: Final = ("prerequisite", "confusion")

SECTION_KIND: Final[dict[str, str]] = {
    "markdown": "text",
    "quick_question": "flash_question",
    "comparison": "dont_confuse",
    "tutor_addition": "tutor_completed",
    "takeaway": "retain",
    "summary_prompt": "summary_prompt",
}

MEDIA_KIND: Final[dict[str, str]] = {
    "pdf": "pdf",
    "audio": "audio",
    "video": "video",
    "youtube": "video",
    "web": "web",
    "note": "note",
    "image": "image",
}

RETRYABLE_CODES: Final = frozenset({"AI_UNAVAILABLE", "AI_RATE_LIMITED", "SERVICE_UNAVAILABLE"})

MAX_CHAPTERS: Final = 40
MAX_SECTIONS: Final = 40
MAX_SOURCE_CHUNKS: Final = 20
MAX_NOTIONS: Final = 30
MAX_LINKS: Final = 30
MAX_SUGGESTIONS: Final = 5
MAX_BLOCKS: Final = 8
MAX_ARROWS: Final = 12
MAX_TITLE: Final = 160
MAX_SECTION_TITLE: Final = 120
MAX_MARKDOWN: Final = 50_000
MAX_QUESTION: Final = 500
MAX_ANSWER: Final = 1_000
MAX_POINT: Final = 200
MAX_MNEMONIC: Final = 300
MAX_SUGGESTION_TITLE: Final = 200
MAX_SUGGESTION_REASON: Final = 500
MAX_URL: Final = 2_048
MAX_DIAGRAM_LABEL: Final = 60

_UUID = re.compile(
    r"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
    r"|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
)
_PLACEHOLDER = re.compile(r"\{\{([a-zA-Z]+(?::\d+)?)\}\}")
_FENCE_OPEN = re.compile(r"^```(?:json)?\s*", re.IGNORECASE)
_FENCE_CLOSE = re.compile(r"\s*```$")
_NON_SLUG = re.compile(r"[^a-z0-9]+")
_URL = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")

CHAPTER_KEYS: Final = (
    "chapterId",
    "title",
    "baseCourse",
    "sections",
    "sourceChunkIds",
    "notionIds",
    "links",
    "resourceSuggestions",
)


def is_uuid(value: Any) -> bool:
    """`Uuid` of the contracts: a canonical identifier, all zeros and all ones included."""
    return isinstance(value, str) and _UUID.fullmatch(value) is not None


def as_record(value: Any) -> dict[str, Any]:
    """`asRecord`: a mapping, or an empty mapping for anything else (arrays included)."""
    return dict(value) if isinstance(value, Mapping) else {}


def location_of(value: Any) -> dict[str, Any]:
    """`locationOf`: a jsonb object, a JSON object string, or nothing."""
    if isinstance(value, Mapping):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return dict(parsed) if isinstance(parsed, Mapping) else {}
    return {}


def known_chunk(row: Mapping[str, Any], owner_id: str) -> KnownChunk:
    """`toKnownChunk`: one `resource_chunks` row as the citation verification sees it."""
    deleted = row.get("deleted_at")
    return KnownChunk(
        chunk_id=str(row["chunk_id"]),
        owner_id=owner_id,
        chapter_id=None if row.get("chapter_id") is None else str(row["chapter_id"]),
        resource_id=str(row["resource_id"]),
        resource_title=str(row["title"]),
        resource_kind=str(row["kind"]),
        resource_status=str(row["status"]),
        resource_deleted=deleted is not None,
        resource_mime=None if row.get("mime") is None else str(row["mime"]),
        text=str(row["text"]),
        location=location_of(row.get("location")),
    )


def uuid_array(ids: Collection[str]) -> str:
    """A `uuid[]` literal bound as one parameter, like the drizzle `inArray` expansion."""
    return "{" + ",".join(ids) + "}"


def js_slice(text: str, limit: int) -> str:
    """`String.prototype.slice`: the first `limit` UTF-16 units, on a code point boundary."""
    if text.isascii():
        return text[:limit]
    units = 0
    kept: list[str] = []
    for character in text:
        cost = 2 if ord(character) > 0xFFFF else 1
        if units + cost > limit:
            break
        kept.append(character)
        units += cost
    return "".join(kept)


def error_message(error: BaseException) -> str:
    """`errorMessage`: the user-facing detail of an `AppError`, else the exception text."""
    if isinstance(error, AppError):
        return error.detail or texts.COURSE_GENERATION_FAILED
    return str(error) or texts.COURSE_GENERATION_FAILED


def retryable(error: BaseException) -> bool:
    """A provider outage or a rate limit is worth a second delivery; nothing else is."""
    return isinstance(error, AppError) and error.code in RETRYABLE_CODES


def scenario_for(
    *,
    has_passages: bool,
    forced_chapter: Any = None,
    explicit: str | None = None,
) -> str:
    """The mock scenario of one chapter: an explicit choice always wins (ADR-0048)."""
    if forced_chapter is not None:
        return str(forced_chapter)
    if explicit is not None:
        return explicit
    return COURSE_SCENARIO_SOURCED if has_passages else COURSE_SCENARIO_BASE


def select_documents(
    chunks: Sequence[KnownChunk],
    budget: int = COURSE_TOKEN_BUDGET,
) -> tuple[list[dict[str, Any]], list[str]]:
    """The passages of one chapter that fit the course budget, in their snapshot order.

    A passage that does not fit stops the selection: a chapter never sends half a passage and never
    exceeds the budget (SPEC-511 EF-3). The returned identifiers are the ones the model may cite.
    """
    documents: list[dict[str, Any]] = []
    selected: list[str] = []
    remaining = budget
    for chunk in chunks:
        title = js_slice(chunk.resource_title, 200)
        document = {
            "source": title,
            "chunkId": chunk.chunk_id,
            "title": title,
            "text": chunk.text,
        }
        formatted = format_document_chunk(
            {
                "chunkId": chunk.chunk_id,
                "source": chunk.resource_title,
                "text": chunk.text,
                "location": dict(chunk.location),
            }
        )
        cost = estimate_tokens(formatted)
        if cost > remaining:
            break
        remaining -= cost
        documents.append(document)
        selected.append(chunk.chunk_id)
    return documents, selected


def _slug(text: str, position: int) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    stripped = "".join(character for character in normalized if not unicodedata.combining(character))
    replaced = _NON_SLUG.sub("-", stripped.lower()).strip("-")
    return replaced[:60] or f"section-{position}"


def section_anchor(
    *,
    chapter_position: int,
    section: Mapping[str, Any],
    position: int,
    used: set[str],
) -> str:
    """`sectionAnchor`: a readable anchor, unique inside the course, at most eighty characters."""
    kind = str(section.get("kind") or "")
    title = section.get("title")
    if isinstance(title, str) and title != "":
        base = title
    elif kind == "takeaway":
        base = "a-retenir"
    elif kind == "quick_question":
        base = "question-eclair"
    elif kind == "comparison":
        base = "ne-pas-confondre"
    elif kind == "summary_prompt":
        base = "resume"
    else:
        base = f"section-{position}"
    slug = _slug(base, position)
    anchor = f"ch-{chapter_position}-{slug}"[:80]
    suffix = 2
    while anchor in used:
        anchor = f"ch-{chapter_position}-{slug}-{suffix}"[:80]
        suffix += 1
    used.add(anchor)
    return anchor


def data_of(section: Mapping[str, Any]) -> dict[str, Any] | None:
    """The structured payload of a section, or `None` when its text carries everything."""
    kind = str(section.get("kind") or "")
    if kind == "quick_question":
        return {"question": section.get("question"), "answer": section.get("answer")}
    if kind == "comparison":
        return {"left": section.get("left"), "right": section.get("right")}
    if kind == "takeaway":
        data: dict[str, Any] = {"points": list(section.get("points") or [])}
        if section.get("diagram") is not None:
            data["diagram"] = section["diagram"]
        if section.get("mnemonic") is not None:
            data["mnemonic"] = section["mnemonic"]
        return data
    return None


def content_of(section: Mapping[str, Any]) -> str | None:
    """The Markdown of a section, or the invitation of a summary prompt."""
    kind = str(section.get("kind") or "")
    if kind in ("markdown", "tutor_addition"):
        return None if section.get("contentMd") is None else str(section["contentMd"])
    if kind == "summary_prompt":
        prompt = section.get("prompt")
        return None if prompt is None else str(prompt)
    return None


def media_of(chunk: KnownChunk) -> str:
    """The `citation_media` of a cited passage, derived from the kind of its resource."""
    if chunk.resource_kind == "exam_guide":
        mime = chunk.resource_mime or ""
        return "pdf" if mime.startswith("application/pdf") else "web"
    return MEDIA_KIND.get(chunk.resource_kind, "web")


def citations_of(
    citations: Sequence[ResolvedCitation],
    chapter_id: str,
    section_index: int,
) -> list[ResolvedCitation]:
    """The citations bound to one section, in the order the verification resolved them."""
    return [
        citation
        for citation in citations
        if citation.chapter_id == chapter_id and citation.section_index == section_index
    ]


def link_ends(link: Mapping[str, Any]) -> tuple[str, str]:
    """`insertNotionLinks`: a confusion link is stored in the canonical order of its ends."""
    start = str(link.get("fromNotionId") or "")
    end = str(link.get("toNotionId") or "")
    if link.get("kind") == "confusion" and start > end:
        return end, start
    return start, end


def course_generated_event_id(course_id: str) -> str:
    """One version event per course version."""
    return f"course-generated:{course_id}"


def course_ready_dedupe_key(course_id: str) -> str:
    """One "course ready" notification per course version."""
    return f"course-ready:{course_id}"


def course_failed_dedupe_key(module_id: str, version: int) -> str:
    """One failure notification per failed version of a module."""
    return f"course-failed:{module_id}:{version}"


def parse_object(text: str) -> Any:
    """`parseObject`: the JSON of one answer, with an optional Markdown fence removed."""
    cleaned = _FENCE_OPEN.sub("", text.strip(), count=1)
    cleaned = _FENCE_CLOSE.sub("", cleaned, count=1)
    return json.loads(cleaned)


def issue_summary(issues: Sequence[str]) -> str:
    """`issueSummary`: at most eight issues, in the order the validation found them."""
    return "; ".join(issues[:8])


def correction_prompt(reason: str) -> str:
    """The user turn that asks the model to fix its own answer (SPEC-608 CL-4)."""
    return CORRECTION_TEMPLATE.format(reason=reason)


def _placeholder_value(key: str, placeholders: Mapping[str, Any]) -> str | None:
    name, _, raw_index = key.partition(":")
    index = max(0, int(raw_index) - 1) if raw_index.isdigit() else 0
    if name in ("chapterId", "chapterTitle", "moduleTitle", "formationTitle"):
        value = placeholders.get(name)
        return None if value is None else str(value)
    if name == "notionId":
        notions = placeholders.get("notions") or ()
        return str(notions[index]["id"]) if index < len(notions) else None
    if name == "chunkId":
        documents = placeholders.get("documents") or ()
        if index < len(documents) and documents[index].get("chunkId") is not None:
            return str(documents[index]["chunkId"])
        return None
    return None


def replace_course_placeholders(value: Any, placeholders: Mapping[str, Any]) -> Any:
    """`replaceCoursePlaceholders`: the identifiers a fixture cannot know are substituted."""
    serialised = json.dumps(value, ensure_ascii=False)

    def substitute(match: re.Match[str]) -> str:
        return _placeholder_value(match.group(1), placeholders) or match.group(0)

    return json.loads(_PLACEHOLDER.sub(substitute, serialised))


def check_draft_belongs_to_chapter(
    draft: Mapping[str, Any],
    *,
    chapter_id: str,
    chapter_notion_ids: Collection[str],
    module_notion_ids: Collection[str],
) -> None:
    """EF-3 - a chapter draft only cites its own chapter, notions and module links."""
    if draft.get("chapterId") != chapter_id:
        raise AppError("INVALID_OUTPUT", texts.COURSE_OTHER_CHAPTER)
    allowed = set(chapter_notion_ids)
    for notion_id in draft.get("notionIds") or []:
        if notion_id not in allowed:
            raise AppError("INVALID_OUTPUT", texts.COURSE_NOTION_OUTSIDE_CHAPTER)
    for link in draft.get("links") or []:
        start = str(link.get("fromNotionId") or "")
        end = str(link.get("toNotionId") or "")
        if start not in module_notion_ids or end not in module_notion_ids:
            raise AppError("INVALID_OUTPUT", texts.COURSE_UNKNOWN_NOTION_LINK)
        if start == end:
            raise AppError("INVALID_OUTPUT", texts.COURSE_SELF_LINK)


# --- validation and normalisation of one chapter draft -------------------------------------------


def _unknown_keys(record: Mapping[str, Any], allowed: Collection[str], path: str) -> list[str]:
    return [f"{path}.{key}: unknown field" for key in record if key not in allowed]


def _read_text(
    record: Mapping[str, Any],
    key: str,
    path: str,
    issues: list[str],
    *,
    required: bool = True,
    minimum: int = 1,
    maximum: int | None = None,
) -> str | None:
    value = record.get(key)
    if value is None:
        if required:
            issues.append(f"{path}.{key}: required")
        return None
    if not isinstance(value, str):
        issues.append(f"{path}.{key}: must be a string")
        return None
    trimmed = value.strip()
    if len(trimmed) < minimum:
        issues.append(f"{path}.{key}: too short")
        return None
    if maximum is not None and len(trimmed) > maximum:
        issues.append(f"{path}.{key}: too long")
        return None
    return trimmed


def _read_bool(
    record: Mapping[str, Any],
    key: str,
    path: str,
    issues: list[str],
    *,
    default: bool = False,
) -> bool:
    value = record.get(key)
    if value is None:
        return default
    if not isinstance(value, bool):
        issues.append(f"{path}.{key}: must be a boolean")
        return default
    return value


def _read_uuid_list(
    record: Mapping[str, Any],
    key: str,
    path: str,
    issues: list[str],
    *,
    maximum: int,
    minimum: int = 0,
) -> list[str]:
    value = record.get(key)
    if value is None:
        value = []
    if not isinstance(value, list):
        issues.append(f"{path}.{key}: must be an array")
        return []
    if len(value) < minimum:
        issues.append(f"{path}.{key}: too few entries")
    if len(value) > maximum:
        issues.append(f"{path}.{key}: too many entries")
    kept: list[str] = []
    for index, entry in enumerate(value):
        if not is_uuid(entry):
            issues.append(f"{path}.{key}.{index}: must be a uuid")
            continue
        kept.append(str(entry))
    return kept


def _read_object(
    record: Mapping[str, Any],
    key: str,
    path: str,
    issues: list[str],
    *,
    required: bool = True,
) -> Mapping[str, Any] | None:
    value = record.get(key)
    if value is None:
        if required:
            issues.append(f"{path}.{key}: required")
        return None
    if not isinstance(value, Mapping):
        issues.append(f"{path}.{key}: must be an object")
        return None
    return value


def _comparison_side(
    record: Mapping[str, Any], key: str, path: str, issues: list[str]
) -> dict[str, Any] | None:
    side = _read_object(record, key, path, issues)
    if side is None:
        return None
    issues.extend(_unknown_keys(side, ("title", "body", "example"), f"{path}.{key}"))
    return {
        "title": _read_text(side, "title", f"{path}.{key}", issues, maximum=80),
        "body": _read_text(side, "body", f"{path}.{key}", issues, maximum=400),
        "example": _read_text(side, "example", f"{path}.{key}", issues, maximum=200),
    }


def _diagram(record: Mapping[str, Any], path: str, issues: list[str]) -> dict[str, Any] | None:
    diagram = record.get("diagram")
    if diagram is None:
        return None
    if not isinstance(diagram, Mapping):
        issues.append(f"{path}.diagram: must be an object")
        return None
    issues.extend(_unknown_keys(diagram, ("blocks", "arrows"), f"{path}.diagram"))
    blocks = diagram.get("blocks")
    arrows = diagram.get("arrows")
    if not isinstance(blocks, list):
        issues.append(f"{path}.diagram.blocks: must be an array")
        blocks = []
    elif not 1 <= len(blocks) <= MAX_BLOCKS:
        issues.append(f"{path}.diagram.blocks: outside bounds")
    kept_blocks: list[dict[str, Any]] = []
    for index, block in enumerate(blocks):
        block_path = f"{path}.diagram.blocks.{index}"
        if not isinstance(block, Mapping):
            issues.append(f"{block_path}: must be an object")
            continue
        issues.extend(_unknown_keys(block, ("id", "label"), block_path))
        kept_blocks.append(
            {
                "id": _read_text(block, "id", block_path, issues, maximum=MAX_DIAGRAM_LABEL),
                "label": _read_text(block, "label", block_path, issues, maximum=MAX_DIAGRAM_LABEL),
            }
        )
    if arrows is None:
        arrows = []
    if not isinstance(arrows, list):
        issues.append(f"{path}.diagram.arrows: must be an array")
        arrows = []
    elif len(arrows) > MAX_ARROWS:
        issues.append(f"{path}.diagram.arrows: too many entries")
    kept_arrows: list[dict[str, Any]] = []
    for index, arrow in enumerate(arrows):
        arrow_path = f"{path}.diagram.arrows.{index}"
        if not isinstance(arrow, Mapping):
            issues.append(f"{arrow_path}: must be an object")
            continue
        issues.extend(_unknown_keys(arrow, ("from", "to", "label"), arrow_path))
        kept: dict[str, Any] = {
            "from": _read_text(arrow, "from", arrow_path, issues, maximum=MAX_DIAGRAM_LABEL),
            "to": _read_text(arrow, "to", arrow_path, issues, maximum=MAX_DIAGRAM_LABEL),
        }
        label = _read_text(arrow, "label", arrow_path, issues, required=False, maximum=MAX_DIAGRAM_LABEL)
        if label is not None:
            kept["label"] = label
        kept_arrows.append(kept)
    identifiers = {block["id"] for block in kept_blocks if block["id"] is not None}
    if any(arrow["from"] not in identifiers or arrow["to"] not in identifiers for arrow in kept_arrows):
        issues.append(f"{path}.diagram.arrows: every arrow links two blocks of the diagram")
    return {"blocks": kept_blocks, "arrows": kept_arrows}


def _section(record: Any, path: str) -> tuple[dict[str, Any] | None, list[str]]:
    issues: list[str] = []
    if not isinstance(record, Mapping):
        return None, [f"{path}: must be an object"]
    kind = record.get("kind")
    if kind not in SECTION_KINDS:
        return None, [f"{path}.kind: unknown section kind"]
    section: dict[str, Any]
    if kind == "markdown":
        issues.extend(
            _unknown_keys(record, ("kind", "title", "contentMd", "sourceChunkIds", "notionIds"), path)
        )
        section = {
            "kind": kind,
            "contentMd": _read_text(record, "contentMd", path, issues, maximum=MAX_MARKDOWN),
            "sourceChunkIds": _read_uuid_list(
                record, "sourceChunkIds", path, issues, minimum=1, maximum=MAX_SOURCE_CHUNKS
            ),
            "notionIds": _read_uuid_list(record, "notionIds", path, issues, maximum=MAX_NOTIONS),
        }
    elif kind == "quick_question":
        issues.extend(
            _unknown_keys(
                record,
                ("kind", "title", "question", "answer", "sourceChunkIds", "notionIds"),
                path,
            )
        )
        section = {
            "kind": kind,
            "question": _read_text(record, "question", path, issues, maximum=MAX_QUESTION),
            "answer": _read_text(record, "answer", path, issues, maximum=MAX_ANSWER),
            "sourceChunkIds": _read_uuid_list(
                record, "sourceChunkIds", path, issues, maximum=MAX_SOURCE_CHUNKS
            ),
            "notionIds": _read_uuid_list(record, "notionIds", path, issues, maximum=MAX_NOTIONS),
        }
    elif kind == "comparison":
        issues.extend(
            _unknown_keys(
                record,
                ("kind", "title", "left", "right", "sourceChunkIds", "notionIds"),
                path,
            )
        )
        section = {
            "kind": kind,
            "left": _comparison_side(record, "left", path, issues),
            "right": _comparison_side(record, "right", path, issues),
            "sourceChunkIds": _read_uuid_list(
                record, "sourceChunkIds", path, issues, maximum=MAX_SOURCE_CHUNKS
            ),
            "notionIds": _read_uuid_list(record, "notionIds", path, issues, maximum=MAX_NOTIONS),
        }
    elif kind == "tutor_addition":
        issues.extend(_unknown_keys(record, ("kind", "title", "contentMd", "notionIds"), path))
        section = {
            "kind": kind,
            "contentMd": _read_text(record, "contentMd", path, issues, maximum=MAX_MARKDOWN),
            "notionIds": _read_uuid_list(record, "notionIds", path, issues, maximum=MAX_NOTIONS),
        }
    elif kind == "takeaway":
        issues.extend(
            _unknown_keys(
                record,
                (
                    "kind",
                    "title",
                    "points",
                    "diagram",
                    "mnemonic",
                    "sourceChunkIds",
                    "notionIds",
                ),
                path,
            )
        )
        points = record.get("points")
        kept_points: list[str] = []
        if not isinstance(points, list):
            issues.append(f"{path}.points: must be an array")
        else:
            if not 3 <= len(points) <= 7:
                issues.append(f"{path}.points: outside bounds")
            for index, point in enumerate(points):
                if not isinstance(point, str) or not point.strip():
                    issues.append(f"{path}.points.{index}: must be a non-empty string")
                    continue
                if len(point.strip()) > MAX_POINT:
                    issues.append(f"{path}.points.{index}: too long")
                    continue
                kept_points.append(point.strip())
        section = {
            "kind": kind,
            "points": kept_points,
            "sourceChunkIds": _read_uuid_list(
                record, "sourceChunkIds", path, issues, maximum=MAX_SOURCE_CHUNKS
            ),
            "notionIds": _read_uuid_list(record, "notionIds", path, issues, maximum=MAX_NOTIONS),
        }
        diagram = _diagram(record, path, issues)
        if diagram is not None:
            section["diagram"] = diagram
        mnemonic = _read_text(record, "mnemonic", path, issues, required=False, maximum=MAX_MNEMONIC)
        if mnemonic is not None:
            section["mnemonic"] = mnemonic
    else:
        issues.extend(_unknown_keys(record, ("kind", "title", "prompt", "notionIds"), path))
        section = {
            "kind": kind,
            "notionIds": _read_uuid_list(record, "notionIds", path, issues, maximum=MAX_NOTIONS),
        }
        prompt = _read_text(record, "prompt", path, issues, required=False, maximum=MAX_QUESTION)
        if prompt is not None:
            section["prompt"] = prompt
    title = _read_text(record, "title", path, issues, required=False, maximum=MAX_SECTION_TITLE)
    if title is not None:
        section["title"] = title
    return section, issues


def _section_sources(section: Mapping[str, Any]) -> Sequence[str]:
    value = section.get("sourceChunkIds")
    return value if isinstance(value, list) else []


def _section_notions(section: Mapping[str, Any]) -> Sequence[str]:
    value = section.get("notionIds")
    return value if isinstance(value, list) else []


def _same_set(left: Sequence[str], right: Sequence[str]) -> bool:
    return set(left) == set(right)


def _links(record: Mapping[str, Any], path: str, issues: list[str]) -> list[dict[str, Any]]:
    value = record.get("links")
    if value is None:
        return []
    if not isinstance(value, list):
        issues.append(f"{path}.links: must be an array")
        return []
    if len(value) > MAX_LINKS:
        issues.append(f"{path}.links: too many entries")
    kept: list[dict[str, Any]] = []
    for index, link in enumerate(value):
        link_path = f"{path}.links.{index}"
        if not isinstance(link, Mapping):
            issues.append(f"{link_path}: must be an object")
            continue
        issues.extend(_unknown_keys(link, ("fromNotionId", "toNotionId", "kind"), link_path))
        start = link.get("fromNotionId")
        end = link.get("toNotionId")
        kind = link.get("kind")
        if not is_uuid(start):
            issues.append(f"{link_path}.fromNotionId: must be a uuid")
        if not is_uuid(end):
            issues.append(f"{link_path}.toNotionId: must be a uuid")
        if kind not in LINK_KINDS:
            issues.append(f"{link_path}.kind: unknown link kind")
        kept.append({"fromNotionId": start, "toNotionId": end, "kind": kind})
    return kept


def _suggestions(record: Mapping[str, Any], path: str, issues: list[str]) -> list[dict[str, Any]]:
    value = record.get("resourceSuggestions")
    if value is None:
        return []
    if not isinstance(value, list):
        issues.append(f"{path}.resourceSuggestions: must be an array")
        return []
    if len(value) > MAX_SUGGESTIONS:
        issues.append(f"{path}.resourceSuggestions: too many entries")
    kept: list[dict[str, Any]] = []
    for index, suggestion in enumerate(value):
        suggestion_path = f"{path}.resourceSuggestions.{index}"
        if not isinstance(suggestion, Mapping):
            issues.append(f"{suggestion_path}: must be an object")
            continue
        issues.extend(_unknown_keys(suggestion, ("title", "url", "reason"), suggestion_path))
        url = _read_text(suggestion, "url", suggestion_path, issues, maximum=MAX_URL)
        if url is not None and (_URL.match(url) is None or "://" not in url):
            issues.append(f"{suggestion_path}.url: must be a valid URL")
        kept.append(
            {
                "title": _read_text(
                    suggestion,
                    "title",
                    suggestion_path,
                    issues,
                    maximum=MAX_SUGGESTION_TITLE,
                ),
                "url": url,
                "reason": _read_text(
                    suggestion,
                    "reason",
                    suggestion_path,
                    issues,
                    maximum=MAX_SUGGESTION_REASON,
                ),
            }
        )
    return kept


def parse_chapter(value: Any, path: str = "chapter") -> tuple[dict[str, Any] | None, list[str]]:
    """`CourseChapterDraftSchema.safeParse`: one validated and normalised chapter draft.

    Every structural rule of BR-COU-02 to BR-COU-06 is checked: a single closing card, only the
    summary invitation after it, at most one flash question and one "ne pas confondre" block, the
    exact union of the section sources and notions, and the base-course rules.
    """
    issues: list[str] = []
    if not isinstance(value, Mapping):
        return None, [f"{path}: must be an object"]
    issues.extend(_unknown_keys(value, CHAPTER_KEYS, path))
    chapter_id = value.get("chapterId")
    if not is_uuid(chapter_id):
        issues.append(f"{path}.chapterId: must be a uuid")
    title = _read_text(value, "title", path, issues, maximum=MAX_TITLE)
    base_course = _read_bool(value, "baseCourse", path, issues)
    raw_sections = value.get("sections")
    sections: list[dict[str, Any]] = []
    if not isinstance(raw_sections, list):
        issues.append(f"{path}.sections: must be an array")
    else:
        if not 1 <= len(raw_sections) <= MAX_SECTIONS:
            issues.append(f"{path}.sections: outside bounds")
        for index, raw in enumerate(raw_sections):
            section, section_issues = _section(raw, f"{path}.sections.{index}")
            issues.extend(section_issues)
            if section is not None:
                sections.append(section)
    sources = _read_uuid_list(value, "sourceChunkIds", path, issues, maximum=MAX_SOURCE_CHUNKS)
    notions = _read_uuid_list(value, "notionIds", path, issues, maximum=MAX_NOTIONS)
    links = _links(value, path, issues)
    suggestions = _suggestions(value, path, issues)

    kinds = [section["kind"] for section in sections]
    takeaway = kinds.index("takeaway") if "takeaway" in kinds else -1
    if takeaway == -1:
        issues.append(f"{path}.sections: the chapter closes with a takeaway card")
    else:
        after = sections[takeaway + 1 :]
        if any(section["kind"] != "summary_prompt" for section in after):
            issues.append(f"{path}.sections: only the summary invitation may follow the takeaway card")
        if kinds.count("takeaway") != 1:
            issues.append(f"{path}.sections: a chapter holds exactly one takeaway card")
    for kind in ("quick_question", "comparison"):
        if kinds.count(kind) > 1:
            issues.append(f"{path}.sections: at most one {kind} section per chapter")
    union_sources = list(
        dict.fromkeys(source for section in sections for source in _section_sources(section))
    )
    if not _same_set(union_sources, sources):
        issues.append(f"{path}.sourceChunkIds: the chapter sources repeat exactly its sections")
    union_notions = list(
        dict.fromkeys(notion for section in sections for notion in _section_notions(section))
    )
    if not _same_set(union_notions, notions):
        issues.append(f"{path}.notionIds: the chapter notions repeat exactly its sections")
    if base_course:
        if union_sources:
            issues.append(f"{path}.baseCourse: a base course cites no source")
        if not suggestions:
            issues.append(f"{path}.resourceSuggestions: a base course suggests a resource")
    else:
        if not union_sources:
            issues.append(f"{path}.baseCourse: a chapter with contributions cites a source")
        if suggestions:
            issues.append(f"{path}.resourceSuggestions: suggestions are for a base course only")
    if issues:
        return None, issues
    return (
        {
            "chapterId": chapter_id,
            "title": title,
            "baseCourse": base_course,
            "sections": sections,
            "sourceChunkIds": sources,
            "notionIds": notions,
            "links": links,
            "resourceSuggestions": suggestions,
        },
        [],
    )


def parse_course(value: Any, path: str = "draft") -> tuple[dict[str, Any] | None, list[str]]:
    """`CourseDraftSchema.safeParse`: one to forty chapter drafts, in their order."""
    if not isinstance(value, Mapping):
        return None, [f"{path}: must be an object"]
    issues = _unknown_keys(value, ("chapters",), path)
    raw = value.get("chapters")
    if not isinstance(raw, list):
        return None, [*issues, f"{path}.chapters: must be an array"]
    if not 1 <= len(raw) <= MAX_CHAPTERS:
        issues.append(f"{path}.chapters: outside bounds")
    chapters: list[dict[str, Any]] = []
    for index, chapter in enumerate(raw):
        parsed, chapter_issues = parse_chapter(chapter, f"{path}.chapters.{index}")
        issues.extend(chapter_issues)
        if parsed is not None:
            chapters.append(parsed)
    if issues:
        return None, issues
    return {"chapters": chapters}, []


__all__ = [
    "COURSE_MAX_CORRECTIONS",
    "COURSE_PROMPT_ID",
    "COURSE_PROMPT_VERSION",
    "COURSE_SCENARIO_BASE",
    "COURSE_SCENARIO_SOURCED",
    "COURSE_TASK",
    "COURSE_TOKEN_BUDGET",
    "GENERATION_KEY_MAX_LENGTH",
    "LINK_KINDS",
    "MEDIA_KIND",
    "NOT_JSON_CORRECTION",
    "RETRYABLE_CODES",
    "SECTION_KIND",
    "SECTION_KINDS",
    "as_record",
    "check_draft_belongs_to_chapter",
    "citations_of",
    "content_of",
    "correction_prompt",
    "course_failed_dedupe_key",
    "course_generated_event_id",
    "course_ready_dedupe_key",
    "data_of",
    "error_message",
    "is_uuid",
    "issue_summary",
    "js_slice",
    "known_chunk",
    "link_ends",
    "location_of",
    "media_of",
    "parse_chapter",
    "parse_course",
    "parse_object",
    "replace_course_placeholders",
    "retryable",
    "scenario_for",
    "section_anchor",
    "select_documents",
    "uuid_array",
]
