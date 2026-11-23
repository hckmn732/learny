"""Generation of the course of one module (SPEC-608 EF-1 to EF-5, SPEC-2207).

Port of `packages/tutor/src/course/generate.ts` and of the `generate-course` job: the caller supplies
a learner-scoped store, so every read and write runs under Row Level Security and the explicit owner
filters repeat the rule. The model calls run outside any transaction; the whole course is validated
before one transaction inserts the new version, its sections, citations, suggestions and notion
links. A replay of the same generation key returns the version created by the first run.

Resumability: every step re-reads the persisted state and skips what is already done, without a
step engine. The entry point returns the existing version of the key before any model call, the
publishing transaction re-reads it under an advisory lock, the citations are verified a second time
just before publishing (a passage deleted meanwhile is never published), and a non-retryable failure
persists one failed version of the key so a redelivery does nothing.

The two notifications are produced by the single entry point of the engagement context (`notify`)
after the commit, as in the other Python use cases (BR-NOT-03); the version event `course/generated`
is written in the outbox of the same transaction, so the question banks are requested once. The
consumer timeout of the job is 600 s (P22 plan); the model calls of one chapter stay bounded by the
`course` task budget.
"""

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.content.domain.citations import (
    CitationValidation,
    KnownChunk,
    ResolvedCitation,
    citation_failure_summary,
    validate_course_citations,
)
from learny.engagement import public as engagement
from learny.identity.domain.actor import Actor
from learny.platform.llm.types import StepInput
from learny.platform.search import canonicalize_url, is_public_http_url
from learny.shared.errors import AppError
from learny.shared.locale_fr import tutor as texts
from learny.tutor.application.ports import TutorDeps
from learny.tutor.domain.course import (
    COURSE_MAX_CORRECTIONS,
    COURSE_PROMPT_ID,
    COURSE_TASK,
    GENERATION_KEY_MAX_LENGTH,
    NOT_JSON_CORRECTION,
    SECTION_KIND,
    check_draft_belongs_to_chapter,
    citations_of,
    content_of,
    correction_prompt,
    course_failed_dedupe_key,
    course_generated_event_id,
    course_ready_dedupe_key,
    data_of,
    error_message,
    is_uuid,
    issue_summary,
    js_slice,
    known_chunk,
    link_ends,
    media_of,
    parse_chapter,
    parse_course,
    parse_object,
    replace_course_placeholders,
    retryable,
    scenario_for,
    section_anchor,
    select_documents,
    uuid_array,
)
from learny.tutor.domain.course_prompt import build_course_prompt

SELECT_MODULE_CONTEXT = text(
    """
    select
      m.formation_id::text as formation_id,
      f.title as formation_title,
      m.id::text as module_id,
      m.title as module_title,
      m.position as module_position,
      p.tutor_tone::text as tone,
      p.course_language::text as course_language
    from public.modules m
    join public.formations f on f.id = m.formation_id
    join public.profiles p on p.id = cast(:user_id as uuid)
    where m.id = cast(:module_id as uuid)
    limit 1
    """
)
SELECT_CHAPTERS = text(
    """
    select id::text as id, position, title
    from public.chapters
    where module_id = cast(:module_id as uuid)
    order by position asc, id asc
    """
)
SELECT_NOTIONS = text(
    """
    select id::text as id, chapter_id::text as chapter_id, label, short_definition
    from public.notions
    where module_id = cast(:module_id as uuid)
    order by chapter_id asc, position asc, id asc
    """
)
SELECT_PASSAGES = text(
    """
    select
      c.id::text as chunk_id,
      c.resource_id::text as resource_id,
      c.chapter_id::text as chapter_id,
      c.text,
      c.location,
      r.title,
      r.kind::text as kind,
      r.status::text as status,
      r.deleted_at,
      r.mime
    from public.resource_chunks c
    join public.resources r on r.id = c.resource_id
    where c.owner_id = cast(:user_id as uuid)
      and c.formation_id = cast(:formation_id as uuid)
      and c.chapter_id is not null
      and r.status = 'ready'
      and r.deleted_at is null
    order by r.created_at asc, c.position asc, c.id asc
    """
)
SELECT_CHUNKS_BY_IDS = text(
    """
    select
      c.id::text as chunk_id,
      c.resource_id::text as resource_id,
      c.chapter_id::text as chapter_id,
      c.text,
      c.location,
      r.title,
      r.kind::text as kind,
      r.status::text as status,
      r.deleted_at,
      r.mime
    from public.resource_chunks c
    join public.resources r on r.id = c.resource_id
    where c.owner_id = cast(:user_id as uuid)
      and c.id = any(cast(:ids as uuid[]))
    """
)
SELECT_EXISTING_COURSE = text(
    """
    select id::text as id, version, status::text as status
    from public.courses
    where owner_id = cast(:user_id as uuid)
      and module_id = cast(:module_id as uuid)
      and generation_key = :generation_key
    limit 1
    """
)
LOCK_COURSE_GENERATION = text("select pg_advisory_xact_lock(hashtextextended(:key, 0))")
SELECT_NEXT_VERSION = text(
    """
    select coalesce(max(version), 0)::int + 1 as next
    from public.courses
    where owner_id = cast(:user_id as uuid) and module_id = cast(:module_id as uuid)
    """
)
INSERT_COURSE = text(
    """
    insert into public.courses (
      owner_id, formation_id, module_id, version, is_current, status, model, generation_key,
      created_at, updated_at
    ) values (
      cast(:user_id as uuid),
      cast(:formation_id as uuid),
      cast(:module_id as uuid),
      :version,
      true,
      'ready',
      :model,
      :generation_key,
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    returning id::text as id
    """
)
INSERT_FAILED_COURSE = text(
    """
    insert into public.courses (
      owner_id, formation_id, module_id, version, is_current, status, model, error,
      generation_key, created_at, updated_at
    ) values (
      cast(:user_id as uuid),
      cast(:formation_id as uuid),
      cast(:module_id as uuid),
      :version,
      false,
      'failed',
      null,
      :error,
      :generation_key,
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    returning id::text as id
    """
)
INSERT_SECTION = text(
    """
    insert into public.course_sections (
      course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, data,
      notion_ids, origin, version, reported, created_at, updated_at
    ) values (
      cast(:course_id as uuid),
      cast(:user_id as uuid),
      cast(:chapter_id as uuid),
      :position,
      cast(:kind as public.section_kind),
      :anchor,
      :title,
      :content_md,
      cast(:data as jsonb),
      cast(:notion_ids as uuid[]),
      cast(:origin as public.content_origin),
      1,
      false,
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    returning id::text as id
    """
)
INSERT_CITATION = text(
    """
    insert into public.citations (
      section_id, owner_id, chunk_id, resource_id, quote, location, label, media_kind, created_at
    ) values (
      cast(:section_id as uuid),
      cast(:user_id as uuid),
      cast(:chunk_id as uuid),
      cast(:resource_id as uuid),
      null,
      cast(:location as jsonb),
      :label,
      cast(:media_kind as public.citation_media),
      cast(:now as timestamptz)
    )
    """
)
SELECT_SUGGESTION = text(
    """
    select id::text as id
    from public.resources
    where owner_id = cast(:user_id as uuid)
      and chapter_id = cast(:chapter_id as uuid)
      and origin = 'tutor_suggestion'
      and url = :url
      and deleted_at is null
    limit 1
    """
)
INSERT_SUGGESTION = text(
    """
    insert into public.resources (
      owner_id, formation_id, chapter_id, kind, origin, suggestion_status, title, url, status,
      metadata, created_at, updated_at
    ) values (
      cast(:user_id as uuid),
      cast(:formation_id as uuid),
      cast(:chapter_id as uuid),
      'web',
      'tutor_suggestion',
      'pending',
      :title,
      :url,
      'queued',
      cast(:metadata as jsonb),
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    """
)
INSERT_NOTION_LINK = text(
    """
    insert into public.notion_links (
      formation_id, from_notion_id, to_notion_id, kind, owner_id, rationale, created_at
    ) values (
      cast(:formation_id as uuid),
      cast(:from_id as uuid),
      cast(:to_id as uuid),
      cast(:kind as public.link_kind),
      cast(:user_id as uuid),
      :rationale,
      cast(:now as timestamptz)
    )
    on conflict do nothing
    """
)


@dataclass(frozen=True, slots=True)
class ChapterSnapshot:
    """One chapter of the module, with the notions and the passages the model may use."""

    id: str
    position: int
    title: str
    notions: tuple[dict[str, Any], ...]
    passages: tuple[KnownChunk, ...]
    documents: tuple[dict[str, Any], ...]


@dataclass(frozen=True, slots=True)
class ModuleSnapshot:
    """Everything the pipeline reads once, before any model call."""

    formation_id: str
    formation_title: str
    module_title: str
    module_position: int
    profile: dict[str, str]
    chapters: tuple[ChapterSnapshot, ...]
    chunks: dict[str, KnownChunk]
    allowed_chunk_ids: frozenset[str]


def _job_actor(user_id: str) -> Actor:
    """The actor a job carries: the identifier only, like the TypeScript service context."""
    return Actor(user_id=user_id, email="", email_confirmed=True, transport="bearer")


def _course_language(value: str) -> str:
    return value if value in ("en", "es", "de") else "fr"


async def read_module_context(tx: Any, user_id: str, module_id: str) -> ModuleSnapshot:
    """`readModuleContext`: the module, its chapters, their notions and the selected passages."""
    modules = (
        (await tx.conn.execute(SELECT_MODULE_CONTEXT, {"user_id": user_id, "module_id": module_id}))
        .mappings()
        .all()
    )
    if not modules:
        raise AppError("NOT_FOUND", texts.COURSE_MODULE_NOT_FOUND)
    module = dict(modules[0])

    chapters = (await tx.conn.execute(SELECT_CHAPTERS, {"module_id": module_id})).mappings().all()
    if not chapters:
        raise AppError("VALIDATION_FAILED", texts.COURSE_EMPTY_MODULE)

    notions = (await tx.conn.execute(SELECT_NOTIONS, {"module_id": module_id})).mappings().all()
    passages = (
        (
            await tx.conn.execute(
                SELECT_PASSAGES,
                {"user_id": user_id, "formation_id": str(module["formation_id"])},
            )
        )
        .mappings()
        .all()
    )

    chunks: dict[str, KnownChunk] = {}
    by_chapter: dict[str, list[KnownChunk]] = {}
    for row in passages:
        chunk = known_chunk(dict(row), user_id)
        chunks[chunk.chunk_id] = chunk
        by_chapter.setdefault(chunk.chapter_id or "", []).append(chunk)

    allowed: set[str] = set()
    snapshots: list[ChapterSnapshot] = []
    for chapter in chapters:
        chapter_id = str(chapter["id"])
        chapter_notions = tuple(
            {
                "id": str(notion["id"]),
                "label": str(notion["label"]),
                "definition": notion["short_definition"],
            }
            for notion in notions
            if str(notion["chapter_id"]) == chapter_id
        )
        chapter_passages = tuple(by_chapter.get(chapter_id, []))
        documents, selected = select_documents(chapter_passages)
        allowed.update(selected)
        snapshots.append(
            ChapterSnapshot(
                id=chapter_id,
                position=int(chapter["position"]),
                title=str(chapter["title"]),
                notions=chapter_notions,
                passages=chapter_passages,
                documents=tuple(documents),
            )
        )
    return ModuleSnapshot(
        formation_id=str(module["formation_id"]),
        formation_title=str(module["formation_title"]),
        module_title=str(module["module_title"]),
        module_position=int(module["module_position"]),
        profile={
            "tone": "tu" if str(module["tone"]) == "tu" else "vous",
            "courseLanguage": _course_language(str(module["course_language"])),
        },
        chapters=tuple(snapshots),
        chunks=chunks,
        allowed_chunk_ids=frozenset(allowed),
    )


def _result_of(row: Mapping[str, Any], module_id: str, *, created: bool) -> dict[str, Any]:
    """One course version as the caller receives it (TS `CourseGenerationResult`)."""
    return {
        "courseId": str(row["id"]),
        "moduleId": module_id,
        "version": int(row["version"]),
        "status": "ready" if str(row["status"]) == "ready" else "failed",
        "created": created,
    }


async def _existing(tx: Any, user_id: str, module_id: str, generation_key: str) -> Mapping[str, Any] | None:
    """The version already published for this key, if any: the guard of one version per request."""
    rows = (
        (
            await tx.conn.execute(
                SELECT_EXISTING_COURSE,
                {
                    "user_id": user_id,
                    "module_id": module_id,
                    "generation_key": generation_key,
                },
            )
        )
        .mappings()
        .all()
    )
    return None if not rows else dict(rows[0])


async def _next_version(tx: Any, user_id: str, module_id: str) -> int:
    rows = (
        (await tx.conn.execute(SELECT_NEXT_VERSION, {"user_id": user_id, "module_id": module_id}))
        .scalars()
        .all()
    )
    return int(rows[0]) if rows and rows[0] is not None else 1


def _mapped(error: AppError) -> AppError:
    """`mapped`: a provider outage keeps its code, any other refusal is a failed AI task."""
    if retryable(error):
        return error
    return AppError("AI_TASK_FAILED", texts.COURSE_TASK_FAILED, cause=error)


def _task_failed(cause: BaseException | None = None) -> AppError:
    if cause is None:
        return AppError("AI_TASK_FAILED", texts.COURSE_TASK_FAILED)
    return AppError("AI_TASK_FAILED", texts.COURSE_TASK_FAILED, cause=cause)


async def _generate_chapter(
    deps: TutorDeps,
    snapshot: ModuleSnapshot,
    chapter: ChapterSnapshot,
    *,
    scenario: str,
) -> tuple[dict[str, Any], str | None]:
    """`runCourseChapter`: one structured call, corrected at most twice (SPEC-608 EF-1, CL-4)."""
    prompt = build_course_prompt(
        profile=snapshot.profile,
        formation_title=snapshot.formation_title,
        module_title=snapshot.module_title,
        chapter_id=chapter.id,
        chapter_title=chapter.title,
        chapter_position=chapter.position,
        notions=chapter.notions,
        documents=chapter.documents,
        base_course=len(chapter.passages) == 0,
    )
    try:
        session = deps.llm.session(COURSE_TASK, COURSE_PROMPT_ID, scenario=scenario)
    except AppError as error:
        raise _mapped(error) from error
    placeholders = {
        "chapterId": chapter.id,
        "chapterTitle": chapter.title,
        "moduleTitle": snapshot.module_title,
        "formationTitle": snapshot.formation_title,
        "notions": chapter.notions,
        "documents": chapter.documents,
    }
    correction: str | None = None
    for _attempt in range(COURSE_MAX_CORRECTIONS + 1):
        messages = prompt.messages
        if correction is not None:
            messages = (*messages, {"role": "user", "content": correction_prompt(correction)})
        try:
            generated = await session.step(StepInput(system=prompt.system, messages=messages))
        except AppError as error:
            if error.code == "INVALID_OUTPUT":
                correction = NOT_JSON_CORRECTION
                continue
            raise _mapped(error) from error
        try:
            value = parse_object(generated.text)
        except ValueError:
            correction = NOT_JSON_CORRECTION
            continue
        parsed, issues = parse_chapter(
            replace_course_placeholders(value, placeholders), f"chapter {chapter.position}"
        )
        if parsed is not None:
            return parsed, generated.model_id or None
        correction = issue_summary(issues)
    raise _task_failed(AppError("INVALID_OUTPUT", texts.COURSE_INVALID_OUTPUT))


def _cited_chunk_ids(draft: Mapping[str, Any]) -> list[str]:
    """`[...new Set(draft.chapters.flatMap(chapter => chapter.sourceChunkIds))]`."""
    ordered: dict[str, None] = {}
    for chapter in draft.get("chapters") or []:
        for chunk_id in chapter.get("sourceChunkIds") or []:
            ordered.setdefault(str(chunk_id), None)
    return list(ordered)


async def _fresh_chunks(tx: Any, user_id: str, chunk_ids: Sequence[str]) -> dict[str, KnownChunk]:
    """`chunksByIds`: the cited passages re-read just before publishing."""
    if not chunk_ids:
        return {}
    rows = (
        (await tx.conn.execute(SELECT_CHUNKS_BY_IDS, {"user_id": user_id, "ids": uuid_array(chunk_ids)}))
        .mappings()
        .all()
    )
    return {str(row["chunk_id"]): known_chunk(dict(row), user_id) for row in rows}


async def _insert_citations(
    tx: Any,
    user_id: str,
    section_id: str,
    citations: Sequence[ResolvedCitation],
    now: datetime,
) -> None:
    for citation in citations:
        await tx.conn.execute(
            INSERT_CITATION,
            {
                "section_id": section_id,
                "user_id": user_id,
                "chunk_id": citation.chunk.chunk_id,
                "resource_id": citation.chunk.resource_id,
                "location": _json(citation.chunk.location),
                "label": js_slice(citation.chunk.resource_title, 120),
                "media_kind": media_of(citation.chunk),
                "now": now,
            },
        )


async def _insert_suggestions(
    tx: Any,
    user_id: str,
    snapshot: ModuleSnapshot,
    chapter: ChapterSnapshot,
    draft: Mapping[str, Any],
    now: datetime,
) -> None:
    """`insertSuggestions`: one pending resource per public URL a base course proposes."""
    for suggestion in draft.get("resourceSuggestions") or []:
        canonical = canonicalize_url(str(suggestion.get("url") or ""))
        if canonical is None or not is_public_http_url(canonical):
            continue
        existing = (
            (
                await tx.conn.execute(
                    SELECT_SUGGESTION,
                    {"user_id": user_id, "chapter_id": chapter.id, "url": canonical},
                )
            )
            .mappings()
            .all()
        )
        if existing:
            continue
        await tx.conn.execute(
            INSERT_SUGGESTION,
            {
                "user_id": user_id,
                "formation_id": snapshot.formation_id,
                "chapter_id": chapter.id,
                "title": suggestion.get("title"),
                "url": canonical,
                "metadata": _json({"suggestionReason": suggestion.get("reason")}),
                "now": now,
            },
        )


async def _insert_notion_links(
    tx: Any,
    user_id: str,
    snapshot: ModuleSnapshot,
    draft: Mapping[str, Any],
    now: datetime,
) -> None:
    """`insertNotionLinks`: one typed link per proposal, in the canonical order of its ends."""
    for link in draft.get("links") or []:
        start, end = link_ends(link)
        await tx.conn.execute(
            INSERT_NOTION_LINK,
            {
                "formation_id": snapshot.formation_id,
                "from_id": start,
                "to_id": end,
                "kind": link.get("kind"),
                "user_id": user_id,
                "rationale": texts.COURSE_LINK_RATIONALE,
                "now": now,
            },
        )


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


async def _publish(
    deps: TutorDeps,
    user_id: str,
    module_id: str,
    snapshot: ModuleSnapshot,
    draft: Mapping[str, Any],
    model: str | None,
    citations: Sequence[ResolvedCitation],
    generation_key: str,
) -> dict[str, Any]:
    """`persistVersion`: one atomic version, guarded by the key and by a second citation check."""
    now = deps.clock.now()
    async with deps.db.user_tx(_job_actor(user_id)) as tx:
        await tx.conn.execute(LOCK_COURSE_GENERATION, {"key": f"course-generation:{user_id}:{module_id}"})
        existing = await _existing(tx, user_id, module_id, generation_key)
        if existing is not None:
            return _result_of(existing, module_id, created=False)

        fresh = await _fresh_chunks(tx, user_id, _cited_chunk_ids(draft))
        checked: CitationValidation = validate_course_citations(
            draft,
            user_id=user_id,
            chunks=fresh,
            allowed_chunk_ids=snapshot.allowed_chunk_ids,
        )
        if not checked.ok:
            raise AppError(
                "CITATION_SOURCE_DELETED",
                texts.COURSE_CITATION_SOURCE_DELETED,
                cause=citation_failure_summary(checked.issues),
            )

        version = await _next_version(tx, user_id, module_id)
        inserted = (
            (
                await tx.conn.execute(
                    INSERT_COURSE,
                    {
                        "user_id": user_id,
                        "formation_id": snapshot.formation_id,
                        "module_id": module_id,
                        "version": version,
                        "model": model,
                        "generation_key": generation_key,
                        "now": now,
                    },
                )
            )
            .mappings()
            .all()
        )
        if not inserted:
            raise AppError("INTERNAL_ERROR", texts.COURSE_VERSION_NOT_CREATED)
        course_id = str(inserted[0]["id"])

        used_anchors: set[str] = set()
        for chapter_draft in draft.get("chapters") or []:
            chapter = next(
                (
                    snapshot_chapter
                    for snapshot_chapter in snapshot.chapters
                    if snapshot_chapter.id == chapter_draft.get("chapterId")
                ),
                None,
            )
            if chapter is None:
                raise AppError("INVALID_OUTPUT", texts.COURSE_UNKNOWN_CHAPTER)
            for index, section in enumerate(chapter_draft.get("sections") or []):
                position = index + 1
                anchor = section_anchor(
                    chapter_position=chapter.position,
                    section=section,
                    position=position,
                    used=used_anchors,
                )
                sources = section.get("sourceChunkIds") or []
                section_rows = (
                    (
                        await tx.conn.execute(
                            INSERT_SECTION,
                            {
                                "course_id": course_id,
                                "user_id": user_id,
                                "chapter_id": chapter.id,
                                "position": position,
                                "kind": SECTION_KIND[str(section["kind"])],
                                "anchor": anchor,
                                "title": section.get("title"),
                                "content_md": content_of(section),
                                "data": None if data_of(section) is None else _json(data_of(section)),
                                "notion_ids": uuid_array(
                                    [str(notion) for notion in section.get("notionIds") or []]
                                ),
                                "origin": "resource" if sources else "tutor",
                                "now": now,
                            },
                        )
                    )
                    .mappings()
                    .all()
                )
                if not section_rows:
                    raise AppError("INTERNAL_ERROR", texts.COURSE_SECTION_NOT_CREATED)
                await _insert_citations(
                    tx,
                    user_id,
                    str(section_rows[0]["id"]),
                    citations_of(citations, chapter.id, index),
                    now,
                )
            await _insert_suggestions(tx, user_id, snapshot, chapter, chapter_draft, now)
            await _insert_notion_links(tx, user_id, snapshot, chapter_draft, now)

        await tx.emit(
            "course/generated",
            {
                "userId": user_id,
                "courseId": course_id,
                "moduleId": module_id,
                "version": version,
                "formationId": snapshot.formation_id,
            },
            event_id=course_generated_event_id(course_id),
            user_id=user_id,
        )
        return {
            "courseId": course_id,
            "moduleId": module_id,
            "version": version,
            "status": "ready",
            "created": True,
        }


async def _publish_failure(
    deps: TutorDeps,
    user_id: str,
    module_id: str,
    snapshot: ModuleSnapshot,
    message: str,
    generation_key: str,
) -> dict[str, Any] | None:
    """`persistFailedVersion`: one failed version of the key, never the current one."""
    now = deps.clock.now()
    async with deps.db.user_tx(_job_actor(user_id)) as tx:
        await tx.conn.execute(LOCK_COURSE_GENERATION, {"key": f"course-generation:{user_id}:{module_id}"})
        existing = await _existing(tx, user_id, module_id, generation_key)
        if existing is not None:
            return _result_of(existing, module_id, created=False)
        version = await _next_version(tx, user_id, module_id)
        inserted = (
            (
                await tx.conn.execute(
                    INSERT_FAILED_COURSE,
                    {
                        "user_id": user_id,
                        "formation_id": snapshot.formation_id,
                        "module_id": module_id,
                        "version": version,
                        "error": js_slice(message, 2_000),
                        "generation_key": generation_key,
                        "now": now,
                    },
                )
            )
            .mappings()
            .all()
        )
        if not inserted:
            return None
        return {
            "courseId": str(inserted[0]["id"]),
            "moduleId": module_id,
            "version": version,
            "status": "failed",
            "created": True,
        }


async def _notify(
    deps: TutorDeps,
    user_id: str,
    *,
    notification_type: str,
    formation_id: str,
    data: Mapping[str, Any],
    dedupe_key: str,
) -> None:
    """The engagement context renders and delivers the notification; a failure never fails the job."""
    logger = getattr(deps, "logger", None)
    try:
        await engagement.notify(
            deps,  # type: ignore[arg-type]
            user_id=user_id,
            notification_type=notification_type,
            formation_id=formation_id,
            data=data,
            dedupe_key=dedupe_key,
        )
    except Exception:
        if logger is not None:
            logger.warn("course-generation.notify.failed", outcome="notification_failed")


async def _notify_ready(
    deps: TutorDeps, user_id: str, snapshot: ModuleSnapshot, module_id: str, course_id: str
) -> None:
    await _notify(
        deps,
        user_id,
        notification_type="course_ready",
        formation_id=snapshot.formation_id,
        data={
            "moduleTitle": snapshot.module_title,
            "formationTitle": snapshot.formation_title,
            "href": f"/formations/{snapshot.formation_id}/modules/{module_id}/cours",
        },
        dedupe_key=course_ready_dedupe_key(course_id),
    )


async def _notify_failure(
    deps: TutorDeps,
    user_id: str,
    snapshot: ModuleSnapshot,
    module_id: str,
    message: str,
    version: int,
) -> None:
    await _notify(
        deps,
        user_id,
        notification_type="ai_task_failed",
        formation_id=snapshot.formation_id,
        data={
            "taskLabel": texts.COURSE_NOTIFICATION_TASK_LABEL,
            "moduleTitle": snapshot.module_title,
            "formationTitle": snapshot.formation_title,
            "href": f"/formations/{snapshot.formation_id}/modules/{module_id}",
            "reason": js_slice(message, 500),
        },
        dedupe_key=course_failed_dedupe_key(module_id, version),
    )


async def generate_course(
    deps: TutorDeps,
    user_id: str,
    module_id: str,
    generation_key: str,
    *,
    scenario: str | None = None,
    scenario_for_chapter: Callable[[str], str | None] | None = None,
) -> dict[str, Any]:
    """EF-1 to EF-5 - generates the whole module chapter by chapter and publishes one version."""
    if not 1 <= len(generation_key) <= GENERATION_KEY_MAX_LENGTH:
        raise AppError("VALIDATION_FAILED", texts.COURSE_GENERATION_KEY_INVALID)
    if not is_uuid(module_id) or not is_uuid(user_id):
        raise AppError("VALIDATION_FAILED", texts.COURSE_REQUEST_INVALID)

    async with deps.db.user_tx(_job_actor(user_id)) as tx:
        snapshot = await read_module_context(tx, user_id, module_id)
        existing = await _existing(tx, user_id, module_id, generation_key)
    if existing is not None:
        return _result_of(existing, module_id, created=False)

    module_notion_ids = {str(notion["id"]) for chapter in snapshot.chapters for notion in chapter.notions}
    drafts: list[dict[str, Any]] = []
    model: str | None = None
    try:
        for chapter in snapshot.chapters:
            selected = scenario_for(
                has_passages=len(chapter.passages) > 0,
                forced_chapter=(None if scenario_for_chapter is None else scenario_for_chapter(chapter.id)),
                explicit=scenario,
            )
            draft, chapter_model = await _generate_chapter(deps, snapshot, chapter, scenario=selected)
            model = chapter_model or model
            check_draft_belongs_to_chapter(
                draft,
                chapter_id=chapter.id,
                chapter_notion_ids=[str(notion["id"]) for notion in chapter.notions],
                module_notion_ids=module_notion_ids,
            )
            drafts.append(draft)

        course, issues = parse_course({"chapters": drafts})
        if course is None:
            raise _task_failed(AppError("INVALID_OUTPUT", issue_summary(issues)))

        checked = validate_course_citations(
            course,
            user_id=user_id,
            chunks=snapshot.chunks,
            allowed_chunk_ids=snapshot.allowed_chunk_ids,
        )
        if not checked.ok:
            raise AppError(
                "CITATION_INVALID",
                texts.COURSE_CITATION_INVALID,
                cause=citation_failure_summary(checked.issues),
            )

        result = await _publish(
            deps,
            user_id,
            module_id,
            snapshot,
            course,
            model,
            checked.citations,
            generation_key,
        )
        if result["created"]:
            await _notify_ready(deps, user_id, snapshot, module_id, result["courseId"])
        return result
    except Exception as error:
        message = error_message(error)
        logger = getattr(deps, "logger", None)
        if logger is not None:
            logger.warn(
                "course generation failed",
                operation="course_generation",
                outcome="failed",
                code=getattr(error, "code", "INTERNAL_ERROR"),
            )
        if not retryable(error):
            failed = await _publish_failure(deps, user_id, module_id, snapshot, message, generation_key)
            if failed is not None and failed["created"]:
                await _notify_failure(deps, user_id, snapshot, module_id, message, failed["version"])
        raise


__all__ = [
    "ChapterSnapshot",
    "ModuleSnapshot",
    "generate_course",
    "read_module_context",
]
