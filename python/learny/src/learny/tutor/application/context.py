"""Reads and assembles the context sent to the tutor (SPEC-610 ET-4, BR-TUT-02, ADR-0178).

The values are re-read under the caller's RLS client and handed to the pure `assemble_context` of
the domain. At most six SQL queries per build, all inside one short read transaction that is closed
before any model call.
"""

import json
import math
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.tutor.application.ports import TutorDeps
from learny.tutor.domain.context import BuiltContext, ContextRecords, assemble_context
from learny.tutor.infrastructure import queries

ARRAY_BRACES = re.compile(r"^\{|\}$")


@dataclass(frozen=True, slots=True)
class ConversationRef:
    """The conversation and the course version it belongs to."""

    id: str
    courseId: str
    chapterId: str


def _as_record(value: Any) -> dict[str, Any]:
    """`asRecord`: a mapping, a JSON object string, or an empty mapping."""
    if value is None:
        return {}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return dict(value) if isinstance(value, Mapping) else {}


def _as_string_array(value: Any) -> list[str]:
    """`asStringArray`: a JSON array, a PostgreSQL array literal, or nothing."""
    if isinstance(value, (list, tuple)):
        return [entry if isinstance(entry, str) else str(entry) for entry in value if entry is not None]
    if isinstance(value, str):
        body = ARRAY_BRACES.sub("", value)
        return [entry for entry in body.split(",") if entry != ""]
    return []


def _js_round(value: float) -> int:
    """`Math.round`: half up, never banker's rounding."""
    return math.floor(value + 0.5)


def records_of(
    head: Mapping[str, Any],
    resources: list[dict[str, Any]],
    gap: Mapping[str, Any] | None,
    sections: list[dict[str, Any]],
    notions: list[dict[str, Any]],
    chunks: list[dict[str, Any]],
) -> ContextRecords:
    """The six reads turned into the pure input of `assemble_context`."""
    return ContextRecords(
        formation_id=str(head["formation_id"]),
        formation_title=str(head["formation_title"]),
        objectives=_as_string_array(head["objectives"]),
        cadrage_profile=_as_record(head["cadrage_profile"]),
        module_position=int(head["module_position"]),
        module_title=str(head["module_title"]),
        chapter_id=str(head["chapter_id"]),
        chapter_position=int(head["chapter_position"]),
        chapter_title=str(head["chapter_title"]),
        course_id=str(head["course_id"]),
        percent=int(head["percent"]),
        tone=str(head["tutor_tone"]),
        course_language=str(head["course_language"]),
        resources=[
            {"id": str(row["id"]), "title": str(row["title"]), "kind": str(row["kind"])} for row in resources
        ],
        gap=(
            None
            if gap is None
            else {
                "notionId": str(gap["notion_id"]),
                "label": str(gap["label"]),
                "nature": str(gap["nature"]),
                "confusedWith": gap["confused_with"],
                "mastery": _js_round(float(gap["mastery"])),
            }
        ),
        sections=[
            {
                "id": str(row["id"]),
                "kind": str(row["kind"]),
                "anchor": str(row["anchor"]),
                "title": row["title"],
                "contentMd": row["content_md"],
                "data": _as_record(row["data"]),
                "notionIds": _as_string_array(row["notion_ids"]),
            }
            for row in sections
        ],
        notions=[{"id": str(row["id"]), "label": str(row["label"])} for row in notions],
        chunks=[
            {
                "chunkId": str(row["chunk_id"]),
                "resourceId": str(row["resource_id"]),
                "title": str(row["title"]),
                "kind": str(row["kind"]),
                "text": str(row["text"]),
                "location": _as_record(row["location"]),
            }
            for row in chunks
        ],
    )


async def build_context(
    deps: TutorDeps,
    actor: Actor,
    conversation: ConversationRef,
    input_context: Mapping[str, Any],
    question: str,
) -> BuiltContext:
    """ET-4 - reads under RLS and assembles the context; `conversation` carries the course link."""
    async with deps.db.user_tx(actor) as tx:
        head = await queries.one(
            tx,
            queries.CONTEXT_META,
            {
                "conversation_id": conversation.id,
                "user_id": actor.user_id,
                "chapter_id": conversation.chapterId,
            },
        )
        if head is None:
            raise AppError("INTERNAL_ERROR")
        resources = await queries.rows(
            tx,
            queries.CONTEXT_RESOURCES,
            {
                "user_id": actor.user_id,
                "formation_id": str(head["formation_id"]),
                "module_id": str(head["module_id"]),
            },
        )
        gap = await queries.one(
            tx,
            queries.CONTEXT_GAP,
            {"user_id": actor.user_id, "chapter_id": str(head["chapter_id"])},
        )
        sections = await queries.rows(
            tx,
            queries.CONTEXT_SECTIONS,
            {"course_id": str(head["course_id"]), "chapter_id": str(head["chapter_id"])},
        )
        notions = await queries.rows(tx, queries.CONTEXT_NOTIONS, {"module_id": str(head["module_id"])})
        chunks = await queries.rows(
            tx,
            queries.CONTEXT_CHUNKS,
            {
                "user_id": actor.user_id,
                "formation_id": str(head["formation_id"]),
                "module_id": str(head["module_id"]),
            },
        )
    records = records_of(head, resources, gap, sections, notions, chunks)
    return assemble_context(records, input_context, question)
