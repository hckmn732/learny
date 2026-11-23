"""Context sent to the tutor (SPEC-610 ET-4, BR-TUT-02, ADR-0178).

The server alone builds the context transmitted to the tutor. The client chooses included keys and
the selected passage; only included keys reach the model, as data inside escaped tags. The resource
passages keep the 4 000-token budget of `read_resources` (ai.md section 3). No IO, no clock, no
model call.
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from learny.shared.locale_fr import tutor as texts
from learny.tutor.domain.format import escape_document_attribute, escape_document_text, lower_initial
from learny.tutor.domain.sources import SourceCandidate, source_label
from learny.tutor.domain.starters import confusion_of

PASSAGE_MAX = 1_000
PASSAGE_PREVIEW = 160
RESOURCE_TOKEN_BUDGET = 4_000
CHAPTER_TEXT_MAX = 6_000
PROMPT_VERSION = 1


@dataclass(frozen=True, slots=True)
class ContextRecords:
    """The six reads of `buildContext`, assembled: pure input of `assemble_context`."""

    formation_id: str
    formation_title: str
    objectives: Sequence[str]
    cadrage_profile: Mapping[str, Any]
    module_position: int
    module_title: str
    chapter_id: str
    chapter_position: int
    chapter_title: str
    course_id: str
    percent: int
    tone: str
    course_language: str
    resources: Sequence[Mapping[str, str]]
    gap: Mapping[str, Any] | None
    sections: Sequence[Mapping[str, Any]]
    notions: Sequence[Mapping[str, str]]
    chunks: Sequence[Mapping[str, Any]]


@dataclass(frozen=True, slots=True)
class BuiltContext:
    """Everything the prompt, the greeting and the stream need, in one value."""

    items: list[dict[str, Any]]
    included_keys: list[str]
    prompt_block: str
    resources_block: str
    sources: list[SourceCandidate]
    gap_first: bool
    notion_ids: list[str]
    profile: dict[str, str]
    formation_id: str
    chapter_id: str
    chapter_title: str
    chapter_position: int
    course_id: str
    primary_resource_title: str | None
    passage_label: str | None
    passage_preview: str | None
    resource_titles: list[str]
    notion_labels: dict[str, str]
    gap_notion_id: str | None
    gap_label: str | None
    gap_nature_text: str | None
    confusion: dict[str, str] | None
    prompt_version: int = PROMPT_VERSION


def _objective_text(objectives: Sequence[str]) -> str:
    return " et ".join(texts.FORMATION_OBJECTIVES.get(objective, objective) for objective in objectives)


def _source_text(profile: Mapping[str, Any]) -> str | None:
    starting = profile.get("starting_point")
    if not isinstance(starting, Mapping):
        return None
    value = starting.get("value")
    return value.strip() if isinstance(value, str) and value.strip() != "" else None


def _passage_label(section_id: str | None, records: ContextRecords) -> str:
    if section_id is None:
        return texts.PASSAGE_SELECTED
    section = next((entry for entry in records.sections if entry.get("id") == section_id), None)
    if section is None:
        return texts.PASSAGE_SELECTED
    if section.get("kind") == "dont_confuse":
        return texts.DONT_CONFUSE
    if section.get("kind") == "tutor_completed":
        return texts.TUTOR_COMPLETED
    title = section.get("title")
    return title if isinstance(title, str) else texts.PASSAGE_SELECTED


def normalize_passage(input_context: Mapping[str, Any]) -> dict[str, str] | None:
    """The client passage is re-normalised: whitespace collapsed, bounded, and dropped under 12 chars."""
    passage = input_context.get("passage")
    if not isinstance(passage, Mapping):
        return None
    raw = passage.get("text")
    if not isinstance(raw, str):
        return None
    text = re.sub(r"\s+", " ", raw).strip()[:PASSAGE_MAX]
    if len(text) < 12:
        return None
    section_id = passage.get("sectionId")
    return {"text": text, "sectionId": section_id} if isinstance(section_id, str) else {"text": text}


def _resource_value(resources: Sequence[Mapping[str, str]]) -> str:
    if not resources:
        return texts.NO_RESOURCE_VALUE
    return ", ".join(lower_initial(str(resource["title"])) for resource in resources)


def gap_value(gap: Mapping[str, Any]) -> str:
    confused_with = gap.get("confusedWith")
    nature = (
        texts.GAP_NATURES.get(str(gap["nature"]), str(gap["nature"]))
        if confused_with is None
        else texts.GAP_CONFUSED.format(other=confused_with)
    )
    return texts.GAP_VALUE.format(label=gap["label"], nature=nature, mastery=int(gap["mastery"]))


def _chapter_value(records: ContextRecords) -> str:
    return texts.CHAPTER_VALUE.format(
        module=records.module_position,
        chapter=records.chapter_position,
        title=records.chapter_title,
        percent=records.percent,
    )


def _chapter_text(records: ContextRecords) -> str:
    parts: list[str] = []
    for section in records.sections:
        if section.get("kind") not in ("text", "tutor_completed", "dont_confuse"):
            continue
        body = section.get("contentMd")
        part = body if isinstance(body, str) else ""
        if part == "":
            title = section.get("title")
            part = title if isinstance(title, str) else ""
        if part != "":
            parts.append(part)
    return "\n\n".join(parts)[:CHAPTER_TEXT_MAX]


def _resources_block(records: ContextRecords) -> tuple[str, int, list[SourceCandidate]]:
    tokens = 0
    documents: list[str] = []
    included: list[SourceCandidate] = []
    for chunk in records.chunks:
        raw = chunk["text"] if isinstance(chunk["text"], str) else ""
        text = f"{raw[:8_000]}\u2026" if len(raw) > 8_000 else raw
        cost = -(-len(text) // 4)
        if tokens + cost > RESOURCE_TOKEN_BUDGET:
            break
        tokens += cost
        candidate = SourceCandidate(
            chunk_id=str(chunk["chunkId"]),
            resource_id=str(chunk["resourceId"]),
            title=str(chunk["title"]),
            kind=str(chunk["kind"]),
            location=chunk.get("location") or {},
        )
        documents.append(
            f'<document source="{escape_document_attribute(source_label(candidate))}" '
            f'chunk="{escape_document_attribute(candidate.chunk_id)}">'
            f"{escape_document_text(text)}</document>"
        )
        included.append(candidate)
    return "\n".join(documents), tokens, included


def mentions(question: str, gap: Mapping[str, Any]) -> bool:
    """BR-TUT-05 \u2014 the question must name the followed gap (or its confusion) to ask first."""
    normalized = question.lower().replace(texts.APOSTROPHE, "").replace("'", "")
    needles = [
        str(gap.get("label") or "").lower().replace(texts.APOSTROPHE, "").replace("'", ""),
        str(gap.get("confusedWith") or "").lower().replace(texts.APOSTROPHE, "").replace("'", ""),
    ]
    return any(len(needle) >= 4 and needle in normalized for needle in needles)


def assemble_context(
    records: ContextRecords,
    input_context: Mapping[str, Any],
    question: str,
) -> BuiltContext:
    """Pure assembly used by the query layer and by the unit tests (CA-2)."""
    passage = normalize_passage(input_context)
    include = input_context.get("include")
    include = include if isinstance(include, Mapping) else {}
    present: list[str] = ["formation", "chapter"]
    if passage is not None:
        present.append("passage")
    present.append("resources")
    if records.gap is not None:
        present.append("gap")
    present.append("profile")

    included_keys = [key for key in present if include.get(key) is not False]

    values: dict[str, str] = {
        "formation": texts.FORMATION_VALUE.format(
            title=records.formation_title, objectives=_objective_text(records.objectives)
        ),
        "chapter": _chapter_value(records),
        "resources": _resource_value(records.resources),
    }
    if passage is not None:
        values["passage"] = f"\u00ab {passage['text']} \u00bb"
    if records.gap is not None:
        values["gap"] = gap_value(records.gap)
    source = _source_text(records.cadrage_profile)
    if source is not None:
        values["profile"] = source

    items = [
        {
            "key": key,
            "label": texts.CONTEXT_LABELS[key],
            "value": values.get(key) or texts.NO_INFORMATION,
            "included": include.get(key) is not False,
        }
        for key in present
    ]

    block = ""
    sources: list[SourceCandidate] = []
    if "resources" in included_keys:
        block, _, sources = _resources_block(records)

    blocks: list[str] = []
    if "formation" in included_keys:
        blocks.append(f"<formation>{escape_document_text(values.get('formation', ''))}</formation>")
    if "chapter" in included_keys:
        blocks.append(f"<reading>{escape_document_text(values.get('chapter', ''))}</reading>")
        text = _chapter_text(records)
        if text != "":
            blocks.append(f"<course>{escape_document_text(text)}</course>")
    if "passage" in included_keys and passage is not None:
        section_id = passage.get("sectionId")
        attribute = "" if section_id is None else f' section="{escape_document_attribute(section_id)}"'
        blocks.append(
            f'<document source="selection"{attribute}>{escape_document_text(passage["text"])}</document>'
        )
    if block != "":
        blocks.append(block)
    if "gap" in included_keys and records.gap is not None:
        blocks.append(f"<gap>{escape_document_text(gap_value(records.gap))}</gap>")
    if "profile" in included_keys and "profile" in values:
        blocks.append(f"<profile>{escape_document_text(values['profile'])}</profile>")

    counts: dict[str, int] = {}
    for row in records.sections:
        for notion_id in row.get("notionIds") or []:
            counts[str(notion_id)] = counts.get(str(notion_id), 0) + 1
    notion_ids = [notion_id for notion_id, _ in sorted(counts.items(), key=lambda entry: -entry[1])[:3]]
    passage_section = (
        None
        if passage is None or passage.get("sectionId") is None
        else next(
            (entry for entry in records.sections if entry.get("id") == passage["sectionId"]),
            None,
        )
    )
    event_notion_ids: list[str] = []
    for notion_id in list((passage_section or {}).get("notionIds") or []) + notion_ids:
        if notion_id not in event_notion_ids:
            event_notion_ids.append(notion_id)

    return BuiltContext(
        items=items,
        included_keys=included_keys,
        prompt_block=f"<context>\n{'\n'.join(blocks)}\n</context>",
        resources_block=block,
        sources=sources,
        gap_first=("gap" in included_keys and records.gap is not None and mentions(question, records.gap)),
        notion_ids=event_notion_ids[:3],
        profile={"tone": records.tone, "courseLanguage": records.course_language},
        formation_id=records.formation_id,
        chapter_id=records.chapter_id,
        chapter_title=records.chapter_title,
        chapter_position=records.chapter_position,
        course_id=records.course_id,
        primary_resource_title=(str(records.resources[0]["title"]) if records.resources else None),
        passage_label=None if passage is None else _passage_label(passage.get("sectionId"), records),
        passage_preview=(
            None
            if passage is None
            else (
                f"{passage['text'][: PASSAGE_PREVIEW - 2]}\u2026"
                if len(passage["text"]) > PASSAGE_PREVIEW
                else passage["text"]
            )
        ),
        resource_titles=[str(resource["title"]) for resource in records.resources],
        notion_labels={str(notion["id"]): str(notion["label"]) for notion in records.notions},
        gap_notion_id=None if records.gap is None else str(records.gap["notionId"]),
        gap_label=None if records.gap is None else str(records.gap["label"]),
        gap_nature_text=(
            None
            if records.gap is None
            else (
                texts.GAP_NATURES.get(str(records.gap["nature"]), str(records.gap["nature"]))
                if records.gap.get("confusedWith") is None
                else texts.GAP_NATURE_CONFUSED_TEXT.format(other=records.gap["confusedWith"])
            )
        ),
        confusion=confusion_of(records.sections),
    )


def greeting_text(context: BuiltContext) -> str:
    """SPEC-610 \u2014 the opening message is composed by the code, never by a model."""
    included = context.included_keys
    resources_included = "resources" in included
    resource_count = len(context.resource_titles)
    resource_label = (
        texts.RESOURCE_SINGULAR if resource_count == 1 else texts.RESOURCE_PLURAL.format(count=resource_count)
    )
    titles = ", ".join(
        re.sub(r"\s*\([^)]*\)\s*$", "", title).lower() for title in context.resource_titles[:4]
    )
    parts: list[str] = []
    if context.passage_label is not None:
        if resources_included and resource_count > 0:
            parts.append(
                texts.GREETING_PASSAGE.format(passage=context.passage_label, resources=resource_label)
            )
        else:
            parts.append(texts.GREETING_PASSAGE_ALONE.format(passage=context.passage_label))
    elif resources_included and resource_count > 0:
        parts.append(texts.GREETING_RESOURCES.format(resources=resource_label, titles=titles))
    else:
        parts.append(texts.GREETING_PLAIN)
    if "gap" in included and context.gap_label is not None and context.gap_nature_text is not None:
        parts.append(
            texts.GREETING_GAP.format(label=context.gap_label.lower(), nature=context.gap_nature_text)
        )
    parts.append(texts.GREETING_QUESTION)
    return " ".join(parts)
