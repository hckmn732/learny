"""Seeds of the course-reading, section and citation tests (SPEC-2203).

The shared local stack runs these use cases under RLS inside a savepoint, exactly like
`identity_support.SavepointTransactions`: every row is seeded as the owner first, then the use case
runs as the learner. Nothing is committed (`rolled_back` reverts the whole transaction).
"""

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import structlog
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Tx
from sqlalchemy import text

from factories.identity_support import (
    FIXED,
    create_chapter,
    create_formation,
    create_module,
    create_user,
    identifier,
)
from factories.learning_deps import LearningTransactions


class NoStorage:
    """The storage gateway is never reached by the reading and section cases."""

    async def sign_upload(self, *args: Any, **kwargs: Any) -> str:
        raise AssertionError("storage is not used here")

    async def sign_read(self, *args: Any, **kwargs: Any) -> str:
        raise AssertionError("storage is not used here")

    async def remove(self, *args: Any, **kwargs: Any) -> None:
        raise AssertionError("storage is not used here")

    async def list(self, *args: Any, **kwargs: Any) -> list[Any]:
        raise AssertionError("storage is not used here")


@dataclass
class ContentTestDeps:
    """The dependency bundle the content use cases see; a `Deps` satisfies the same protocol."""

    settings: Settings
    clock: FixedClock
    db: LearningTransactions
    storage: Any
    logger: Any
    llm: Any = None


def content_deps(
    tx: Tx,
    *,
    now: datetime = FIXED,
    settings: Settings | None = None,
    storage: Any = None,
) -> ContentTestDeps:
    """Builds the stand-in bundle around an already open seed transaction."""
    return ContentTestDeps(
        settings=Settings() if settings is None else settings,
        clock=FixedClock(now),
        db=LearningTransactions(tx),
        storage=NoStorage() if storage is None else storage,
        logger=structlog.get_logger("learny.test"),
    )


async def seed_learner(
    tx: Tx,
    first_name: str,
    *,
    chapters: int = 2,
    modules: int = 3,
    module_index: int = 0,
    formation_title: str = "Formation de test",
) -> dict[str, Any]:
    """A learner with one formation, its modules and the chapters of the selected module."""
    user_id = await create_user(tx.conn, first_name)
    formation_id = await create_formation(tx.conn, user_id, title=formation_title)
    module_ids = [
        await create_module(tx.conn, formation_id, position, title=f"Partie {position}")
        for position in range(1, modules + 1)
    ]
    target = module_ids[module_index]
    chapter_ids = [
        await create_chapter(tx.conn, formation_id, target, position) for position in range(1, chapters + 1)
    ]
    return {
        "user": user_id,
        "formation": formation_id,
        "module": target,
        "modules": module_ids,
        "chapter": chapter_ids[0] if chapter_ids else None,
        "chapters": chapter_ids,
    }


async def create_course(
    tx: Tx,
    *,
    owner_id: str,
    formation_id: str,
    module_id: str,
    version: int = 1,
    status: str = "ready",
    is_current: bool = True,
    model: str | None = "mock",
    error: str | None = None,
    created_at: datetime = FIXED,
) -> str:
    return await identifier(
        tx.conn,
        """
        insert into public.courses (
          owner_id, formation_id, module_id, version, is_current, status, model, error,
          created_at, updated_at
        ) values (
          cast(:owner as uuid), cast(:formation as uuid), cast(:module as uuid), :version,
          :current, cast(:status as public.course_status), :model, :error,
          cast(:created as timestamptz), cast(:created as timestamptz)
        )
        returning id::text as id
        """,
        owner=owner_id,
        formation=formation_id,
        module=module_id,
        version=version,
        current=is_current,
        status=status,
        model=model,
        error=error,
        created=created_at,
    )


async def create_section(
    tx: Tx,
    *,
    course_id: str,
    owner_id: str,
    chapter_id: str,
    position: int = 1,
    kind: str = "text",
    anchor: str = "section-1",
    title: str | None = "Introduction",
    content_md: str | None = "Bonjour le monde comptable.",
    data: Any = None,
    notion_ids: list[str] | None = None,
    origin: str = "resource",
    version: int = 1,
    reported: bool = False,
) -> str:
    return await identifier(
        tx.conn,
        """
        insert into public.course_sections (
          course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, data,
          notion_ids, origin, version, reported, created_at, updated_at
        ) values (
          cast(:course as uuid), cast(:owner as uuid), cast(:chapter as uuid), :position,
          cast(:kind as public.section_kind), :anchor, :title, :content_md, cast(:data as jsonb),
          cast(:notions as uuid[]), cast(:origin as public.content_origin), :version, :reported,
          cast(:created as timestamptz), cast(:created as timestamptz)
        )
        returning id::text as id
        """,
        course=course_id,
        owner=owner_id,
        chapter=chapter_id,
        position=position,
        kind=kind,
        anchor=anchor,
        title=title,
        content_md=content_md,
        data=None if data is None else json.dumps(data, ensure_ascii=False),
        notions=notion_ids or [],
        origin=origin,
        version=version,
        reported=reported,
        created=FIXED,
    )


async def create_chunk(
    tx: Tx,
    *,
    resource_id: str,
    owner_id: str,
    formation_id: str,
    chapter_id: str | None,
    position: int = 1,
    body: str = "Every accounting entry is a document.",
    location: Any = None,
) -> str:
    """One indexed passage of a ready resource, which makes a citation readable."""
    return await identifier(
        tx.conn,
        """
        insert into public.resource_chunks (
          resource_id, owner_id, formation_id, chapter_id, position, text, location, created_at
        ) values (
          cast(:resource as uuid), cast(:owner as uuid), cast(:formation as uuid),
          cast(:chapter as uuid), :position, :text,
          cast(:location as jsonb), cast(:created as timestamptz)
        )
        returning id::text as id
        """,
        resource=resource_id,
        owner=owner_id,
        formation=formation_id,
        chapter=chapter_id,
        position=position,
        text=body,
        location=json.dumps({"page": 4, "charStart": 0, "charEnd": 42} if location is None else location),
        created=FIXED,
    )


async def create_citation(
    tx: Tx,
    *,
    section_id: str,
    owner_id: str,
    label: str = "Guide FI",
    media_kind: str = "pdf",
    quote: str | None = "Every accounting entry is a document.",
    location: Any = None,
    resource_id: str | None = None,
    chunk_id: str | None = None,
) -> str:
    return await identifier(
        tx.conn,
        """
        insert into public.citations (
          section_id, owner_id, chunk_id, resource_id, quote, location, label, media_kind,
          created_at
        ) values (
          cast(:section as uuid), cast(:owner as uuid), cast(:chunk as uuid),
          cast(:resource as uuid), :quote, cast(:location as jsonb), :label,
          cast(:media as public.citation_media), cast(:created as timestamptz)
        )
        returning id::text as id
        """,
        section=section_id,
        owner=owner_id,
        chunk=chunk_id,
        resource=resource_id,
        quote=quote,
        location=None if location is None else json.dumps(location, ensure_ascii=False),
        label=label,
        media=media_kind,
        created=FIXED,
    )


async def create_resource(
    tx: Tx,
    *,
    owner_id: str,
    formation_id: str,
    chapter_id: str | None,
    kind: str = "note",
    title: str = "Note",
    origin: str = "learner",
    status: str = "ready",
    url: str | None = None,
    mime: str | None = None,
    size_bytes: int | None = None,
    storage_path: str | None = None,
    suggestion_status: str | None = None,
    suggestion_reason: str | None = None,
    content_text: str | None = None,
    deleted_at: datetime | None = None,
    metadata: Any = None,
) -> str:
    payload: dict[str, Any] = {} if metadata is None else dict(metadata)
    if suggestion_reason is not None:
        payload["suggestionReason"] = suggestion_reason
    return await identifier(
        tx.conn,
        """
        insert into public.resources (
          owner_id, formation_id, chapter_id, kind, origin, suggestion_status, title,
          content_text, storage_path, url, mime, size_bytes, status, metadata, deleted_at,
          created_at, updated_at
        ) values (
          cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid),
          cast(:kind as public.resource_kind), cast(:origin as public.resource_origin),
          cast(:suggestion as public.suggestion_status), :title, :content_text, :storage_path,
          :url, :mime, :size_bytes, cast(:status as public.resource_status),
          cast(:metadata as jsonb), cast(:deleted as timestamptz),
          cast(:created as timestamptz), cast(:created as timestamptz)
        )
        returning id::text as id
        """,
        owner=owner_id,
        formation=formation_id,
        chapter=chapter_id,
        kind=kind,
        origin=origin,
        suggestion=suggestion_status,
        title=title,
        content_text=content_text,
        storage_path=storage_path,
        url=url,
        mime=mime,
        size_bytes=size_bytes,
        status=status,
        metadata=json.dumps(payload, ensure_ascii=False),
        deleted=deleted_at,
        created=FIXED,
    )


async def create_summary(
    tx: Tx,
    *,
    user_id: str,
    chapter_id: str,
    course_id: str,
    body: str = "Une piece a un en-tete.",
    feedback: Any = None,
    created_at: datetime = FIXED,
) -> str:
    return await identifier(
        tx.conn,
        """
        insert into public.chapter_summaries (
          user_id, chapter_id, course_id, text, feedback, created_at
        ) values (
          cast(:user as uuid), cast(:chapter as uuid), cast(:course as uuid), :text,
          cast(:feedback as jsonb), cast(:created as timestamptz)
        )
        returning id::text as id
        """,
        user=user_id,
        chapter=chapter_id,
        course=course_id,
        text=body,
        feedback=None if feedback is None else json.dumps(feedback, ensure_ascii=False),
        created=created_at,
    )


async def create_progress(
    tx: Tx,
    *,
    user_id: str,
    course_id: str,
    chapter_id: str,
    percent: int,
    updated_at: datetime = FIXED,
) -> None:
    await tx.conn.execute(
        text(
            """
            insert into public.reading_progress (user_id, course_id, chapter_id, percent, updated_at)
            values (cast(:user as uuid), cast(:course as uuid), cast(:chapter as uuid), :percent,
                    cast(:updated as timestamptz))
            """
        ),
        {
            "user": user_id,
            "course": course_id,
            "chapter": chapter_id,
            "percent": percent,
            "updated": updated_at,
        },
    )


async def create_brick(
    tx: Tx,
    *,
    owner_id: str,
    formation_id: str,
    notion_ids: list[str],
    purpose: str = "bank",
    status: str = "active",
    brick_type: str = "choice_question",
) -> str:
    return await identifier(
        tx.conn,
        """
        insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
        values (
          cast(:owner as uuid), cast(:formation as uuid), cast(:type as public.brick_type),
          cast(:notions as uuid[]), cast(:purpose as public.brick_purpose),
          cast(:status as public.brick_status)
        )
        returning id::text as id
        """,
        owner=owner_id,
        formation=formation_id,
        type=brick_type,
        notions=notion_ids,
        purpose=purpose,
        status=status,
    )


async def create_report(
    tx: Tx,
    *,
    owner_id: str,
    section_id: str,
    reason: str = "The passage is wrong.",
    status: str = "open",
    affected: list[str] | None = None,
    request_key: str | None = None,
) -> str:
    return await identifier(
        tx.conn,
        """
        insert into public.course_section_reports (
          owner_id, section_id, reason, status, affected_brick_ids, request_key, created_at
        ) values (
          cast(:owner as uuid), cast(:section as uuid), :reason,
          cast(:status as public.course_section_report_status), cast(:affected as uuid[]),
          :key, cast(:created as timestamptz)
        )
        returning id::text as id
        """,
        owner=owner_id,
        section=section_id,
        reason=reason,
        status=status,
        affected=affected or [],
        key=request_key,
        created=FIXED,
    )


async def event_ids(tx: Tx, prefix: str) -> list[str]:
    """The outbox events whose identifier starts with `prefix`."""
    result = await tx.conn.execute(
        text("select event_id from public.event_outbox where event_id like :prefix order by event_id"),
        {"prefix": f"{prefix}%"},
    )
    return [row[0] for row in result.all()]


async def event_row(tx: Tx, event_id: str) -> Any:
    result = await tx.conn.execute(
        text("select name, data from public.event_outbox where event_id = :id"), {"id": event_id}
    )
    return result.mappings().all()


async def column(tx: Tx, table: str, column_name: str, row_id: str) -> Any:
    """One column of one row, for a projection the use case should not change."""
    statement = (
        f"select {column_name} as value from public.{table}"  # noqa: S608 - names are test constants
        " where id = cast(:id as uuid)"
    )
    result = await tx.conn.execute(text(statement), {"id": row_id})
    return result.scalar_one()
