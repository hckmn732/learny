"""Recorded demonstrations of the SDD pages (SPEC-2302).

Port of `packages/api-routes/src/dev-sdd/spec-{103,...,115}.ts`. Each page builds its fixture with
the factories of `learny.shared.devfixtures` inside a transaction that is always rolled back,
measures it and answers the shape of the TypeScript loader. The French texts live in
`locale_fr/dev_sdd_fixtures.py`.
"""

import hashlib
import json
import unicodedata
import uuid
from typing import Any

from learny.assessments.domain.bricks.types import BRICK_TYPES
from learny.content.domain.embeddings import fake_embedding, to_vector_literal
from learny.shared.devfixtures import (
    add_brick_version,
    apply_review,
    create_activity,
    create_attempt,
    create_course,
    create_group,
    create_notion_state,
    create_programme,
    create_user,
    detect_gap,
    get_due_notion_states,
    get_review_history,
    join_group,
    json_value,
    record_answer,
)
from learny.shared.locale_fr import dev_sdd_fixtures as fixture
from learny.shared.time import to_iso
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from learny_api.dev_demos.guard import require_dev
from learny_api.dev_demos.support import demo_email, probe, raised_code, rolled_back
from learny_api.pipeline import Call

RAISED_LIMIT_CODES = (
    "chapter_resource_limit",
    "storage_quota_exceeded",
    "resource_pdf_limit",
    "resource_image_limit",
)
BRICK_PURPOSES = ("validation", "exercise", "course", "bank")
GAP_NATURES = ("confusion", "application", "misunderstanding", "forgetting")

FIXED = "2026-11-11T12:20:00.000Z"
FIRST_REVIEW = "2026-11-11T07:00:00.000Z"
SECOND_REVIEW = "2026-11-11T08:00:00.000Z"
FIRST_DUE = "2026-11-11T07:10:00.000Z"
SECOND_DUE = "2026-11-11T09:00:00.000Z"
GAP_REVIEW = "2026-11-09T08:00:00.000Z"
GAP_DUE = "2026-11-10T18:00:00.000Z"
GAP_DETECTED = "2026-11-09T08:01:00.000Z"


def number(value: Any) -> Any:
    """`Number(value)`: an integral value stays an integer, like the JavaScript number."""
    if value is None:
        return None
    numeric = float(value)
    return int(numeric) if numeric.is_integer() else numeric


def plan_of(row: Any) -> str:
    """`JSON.stringify(planRows[0]?.['QUERY PLAN'] ?? null)`."""
    if row is None:
        return "null"
    value = json_value(row["QUERY PLAN"])
    return value if isinstance(value, str) else json.dumps(value, separators=(",", ":"))


# --- SPEC-103 -----------------------------------------------------------------------------------

SELECT_103_TREE = text(
    """
    select m.position as module_position, m.title as module_title, m.threshold as module_threshold,
           c.position as chapter_position, c.title as chapter_title,
           n.position as notion_position, n.label as notion_label
    from public.modules m
    left join public.chapters c on c.module_id = m.id
    left join public.notions n on n.chapter_id = c.id
    where m.formation_id = cast(:formation as uuid)
    order by m.position, c.position, n.position
    """
)
INSERT_103_LINK = text(
    """
    insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind)
    values (cast(:formation as uuid), cast(:from_notion as uuid), cast(:to_notion as uuid),
            cast(:kind as public.link_kind))
    """
)
UPDATE_103_NOTION = text(
    "update public.notions set label = :label, short_definition = :definition "
    "where id = cast(:notion as uuid)"
)
SELECT_103_MATCHES = text(
    """
    select label
    from public.notions
    where formation_id = cast(:formation as uuid)
      and to_tsvector(
        'simple',
        public.immutable_unaccent(label || ' ' || coalesce(short_definition, ''))
      ) @@ plainto_tsquery('simple', public.immutable_unaccent(:query))
    """
)
EXPLAIN_103 = text(
    """
    explain (format json)
    select id
    from public.notions
    where to_tsvector(
      'simple',
      public.immutable_unaccent(label || ' ' || coalesce(short_definition, ''))
    ) @@ plainto_tsquery('simple', public.immutable_unaccent(:query))
    """
)


async def _load_tree(conn: Any, formation_id: str) -> list[dict[str, Any]]:
    records = (await conn.execute(SELECT_103_TREE, {"formation": formation_id})).mappings().all()
    modules: dict[int, dict[str, Any]] = {}
    chapters: dict[str, dict[str, Any]] = {}
    for row in records:
        module_position = int(row["module_position"])
        module = modules.get(module_position)
        if module is None:
            module = {
                "position": module_position,
                "title": str(row["module_title"]),
                "threshold": int(row["module_threshold"]),
                "chapters": [],
            }
            modules[module_position] = module
        if row["chapter_position"] is None:
            continue
        chapter_position = int(row["chapter_position"])
        chapter_key = f"{module_position}:{chapter_position}"
        chapter = chapters.get(chapter_key)
        if chapter is None:
            chapter = {
                "position": chapter_position,
                "title": str(row["chapter_title"]),
                "notions": [],
            }
            chapters[chapter_key] = chapter
            module["chapters"].append(chapter)
        if row["notion_position"] is None:
            continue
        chapter["notions"].append(
            {"position": int(row["notion_position"]), "label": str(row["notion_label"])}
        )
    return [modules[position] for position in sorted(modules)]


async def spec_103(call: Call) -> dict[str, Any]:
    """`devSddSpec103Demo`: the programme tree, the seven constraints and the full-text plan."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        user = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-103-demo"), first_name="Alex"
        )
        programme = await create_programme(
            conn, user.id, modules=2, chapters_per_module=2, notions_per_chapter=2
        )
        modules = await _load_tree(conn, programme.formation_id)
        notions = programme.notion_ids
        first, second, third = notions[0], notions[1], notions[2]
        fourth, fifth, sixth, seventh = notions[3], notions[4], notions[5], notions[6]

        cl1 = await probe(
            conn,
            "spec103_cl1",
            text("update public.formations set default_threshold = 59 where id = cast(:formation as uuid)"),
            {"formation": programme.formation_id},
        )
        cl2 = await probe(
            conn,
            "spec103_cl2",
            text(
                "update public.formations set status = 'programme_proposed', objectives = '{}' "
                "where id = cast(:formation as uuid)"
            ),
            {"formation": programme.formation_id},
        )
        cl4 = await probe(
            conn,
            "spec103_cl4",
            text(
                """
                insert into public.notions (formation_id, module_id, chapter_id, label, position)
                values (cast(:formation as uuid), cast(:module as uuid), cast(:chapter as uuid),
                        :label, 3)
                """
            ),
            {
                "formation": programme.formation_id,
                "module": programme.module_ids[0],
                "chapter": programme.chapter_ids[2],
                "label": fixture.SPEC103_INCONSISTENT_NOTION,
            },
        )

        for source, target in ((first, second), (second, third)):
            await conn.execute(
                INSERT_103_LINK,
                {
                    "formation": programme.formation_id,
                    "from_notion": source,
                    "to_notion": target,
                    "kind": "prerequisite",
                },
            )
        cl5 = await probe(
            conn,
            "spec103_cl5",
            INSERT_103_LINK,
            {
                "formation": programme.formation_id,
                "from_notion": third,
                "to_notion": first,
                "kind": "prerequisite",
            },
        )

        low, high = (fourth, fifth) if fourth < fifth else (fifth, fourth)
        cl6 = await probe(
            conn,
            "spec103_cl6",
            INSERT_103_LINK,
            {
                "formation": programme.formation_id,
                "from_notion": high,
                "to_notion": low,
                "kind": "confusion",
            },
        )

        await conn.execute(
            INSERT_103_LINK,
            {
                "formation": programme.formation_id,
                "from_notion": sixth,
                "to_notion": seventh,
                "kind": "tutor",
            },
        )
        cl7 = await probe(
            conn,
            "spec103_cl7",
            INSERT_103_LINK,
            {
                "formation": programme.formation_id,
                "from_notion": sixth,
                "to_notion": seventh,
                "kind": "tutor",
            },
        )

        module_one, module_two = programme.module_ids[0], programme.module_ids[1]
        await conn.execute(
            text("update public.modules set position = 2 where id = cast(:module as uuid)"),
            {"module": module_one},
        )
        await conn.execute(
            text("update public.modules set position = 1 where id = cast(:module as uuid)"),
            {"module": module_two},
        )
        await conn.execute(text("set constraints all immediate"))

        await conn.execute(
            UPDATE_103_NOTION,
            {
                "notion": first,
                "label": fixture.SPEC103_FIRST_NOTION_LABEL,
                "definition": fixture.SPEC103_FIRST_NOTION_DEFINITION,
            },
        )
        await conn.execute(
            UPDATE_103_NOTION,
            {
                "notion": second,
                "label": fixture.SPEC103_SECOND_NOTION_LABEL,
                "definition": fixture.SPEC103_SECOND_NOTION_DEFINITION,
            },
        )
        matches = (
            (
                await conn.execute(
                    SELECT_103_MATCHES,
                    {"formation": programme.formation_id, "query": fixture.SPEC103_FTS_QUERY},
                )
            )
            .mappings()
            .all()
        )
        await conn.execute(text("set local enable_seqscan = off"))
        plan_row = (await conn.execute(EXPLAIN_103, {"query": fixture.SPEC103_FTS_QUERY})).mappings().first()
        plan = plan_of(plan_row)

    cases = (
        ("cl1", "23514", cl1),
        ("cl2", "23514", cl2),
        ("cl4", "23503", cl4),
        ("cl5", "23514", cl5),
        ("cl6", "23514", cl6),
        ("cl7", "23505", cl7),
    )
    constraints = [
        {
            "key": key,
            "expected": expected,
            "sqlstate": failure["code"],
            "message": failure["message"],
            "ok": failure["code"] == expected,
        }
        for key, expected, failure in cases
    ]
    constraints.append(
        {
            "key": "cl3",
            "expected": "00000",
            "sqlstate": "00000",
            "message": fixture.SPEC103_CL3_MESSAGE,
            "ok": True,
        }
    )
    return {
        "modules": modules,
        "constraints": constraints,
        "fts": {
            "query": fixture.SPEC103_FTS_QUERY,
            "matchCount": len(matches),
            "matchedLabel": "" if not matches else str(matches[0]["label"]),
            "plan": plan,
            "indexUsed": "notions_fts_idx" in plan,
        },
    }


# --- SPEC-104 -----------------------------------------------------------------------------------

SELECT_104_CHUNKS = text(
    """
    select position, text, (location ->> 'charStart')::int as char_start,
           (location ->> 'charEnd')::int as char_end
    from public.resource_chunks
    where resource_id = cast(:resource as uuid)
    order by position
    """
)
INSERT_104_RESOURCE = text(
    """
    insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text,
                                  status)
    values (cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid), 'note',
            :title, :content, 'ready')
    returning id::text as id
    """
)
INSERT_104_CHUNK = text(
    """
    insert into public.resource_chunks (
      resource_id, owner_id, formation_id, chapter_id, position, text, location, token_count,
      embedding
    )
    values (
      cast(:resource as uuid), cast(:owner as uuid), cast(:formation as uuid),
      cast(:chapter as uuid), :position, :content, cast(:location as jsonb), :token_count,
      cast(:embedding as extensions.vector)
    )
    """
)
SEARCH_104 = text(
    """
    select position, text,
           round((embedding <=> cast(:vector as extensions.vector))::numeric, 4)::float8 as distance
    from public.resource_chunks
    where owner_id = cast(:owner as uuid)
    order by embedding <=> cast(:vector as extensions.vector)
    limit 3
    """
)
EXPLAIN_104 = text("explain (format json) " + SEARCH_104.text)
UPDATE_104_DELETE = text("update public.resources set deleted_at = now() where id = cast(:resource as uuid)")
SELECT_104_RETAINED = text(
    "select title, content_text, deleted_at from public.resources where id = cast(:resource as uuid)"
)


async def _chunks_104(conn: Any, resource_id: str) -> list[dict[str, Any]]:
    records = (await conn.execute(SELECT_104_CHUNKS, {"resource": resource_id})).mappings().all()
    return [
        {
            "position": int(row["position"]),
            "text": str(row["text"]),
            "charStart": int(row["char_start"]),
            "charEnd": int(row["char_end"]),
        }
        for row in records
    ]


async def spec_104(call: Call) -> dict[str, Any]:
    """`devSddSpec104Demo`: the note and its passages, the vector search and the soft deletion."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        user = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-104-demo"), first_name="Alex"
        )
        programme = await create_programme(
            conn, user.id, modules=1, chapters_per_module=1, notions_per_chapter=0
        )
        chapter_id = programme.chapter_ids[0]
        resource_row = (
            (
                await conn.execute(
                    INSERT_104_RESOURCE,
                    {
                        "owner": user.id,
                        "formation": programme.formation_id,
                        "chapter": chapter_id,
                        "title": fixture.SPEC104_RESOURCE_TITLE,
                        "content": fixture.SPEC104_NOTE,
                    },
                )
            )
            .mappings()
            .first()
        )
        if resource_row is None:
            raise LookupError("demonstration resource not created")
        resource_id = str(resource_row["id"])

        for position, content in enumerate(fixture.SPEC104_PASSAGES):
            char_start = fixture.SPEC104_NOTE.find(content)
            await conn.execute(
                INSERT_104_CHUNK,
                {
                    "resource": resource_id,
                    "owner": user.id,
                    "formation": programme.formation_id,
                    "chapter": chapter_id,
                    "position": position,
                    "content": content,
                    "location": json.dumps({"charStart": char_start, "charEnd": char_start + len(content)}),
                    "token_count": len(content.split(" ")),
                    "embedding": to_vector_literal(fake_embedding(content)),
                },
            )

        vector = to_vector_literal(fake_embedding(fixture.SPEC104_QUERY))
        await conn.execute(text("set local hnsw.ef_search = 40"))
        await conn.execute(text("set local enable_seqscan = off"))
        await conn.execute(text("set local enable_sort = off"))
        await conn.execute(text("set local enable_bitmapscan = off"))
        plan_row = (await conn.execute(EXPLAIN_104, {"owner": user.id, "vector": vector})).mappings().first()
        plan = plan_of(plan_row)
        neighbours = (await conn.execute(SEARCH_104, {"owner": user.id, "vector": vector})).mappings().all()

        cl1 = await probe(
            conn,
            "spec104_cl1",
            text(
                """
                insert into public.resources (owner_id, formation_id, chapter_id, kind, title,
                                              content_text)
                values (cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid),
                        'note', :title, repeat('a', 100001))
                """
            ),
            {
                "owner": user.id,
                "formation": programme.formation_id,
                "chapter": chapter_id,
                "title": fixture.SPEC104_LONG_NOTE_TITLE,
            },
        )
        cl2 = await probe(
            conn,
            "spec104_cl2",
            text(
                """
                insert into public.resources (
                  owner_id, formation_id, chapter_id, kind, title, storage_path, size_bytes,
                  metadata
                )
                values (cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid),
                        'pdf', :title, :path, 1024, '{"pages": 501}'::jsonb)
                """
            ),
            {
                "owner": user.id,
                "formation": programme.formation_id,
                "chapter": chapter_id,
                "title": fixture.SPEC104_LONG_PDF_TITLE,
                "path": f"{user.id}/00000000-0000-4000-8000-000000000000/" + fixture.SPEC104_PDF_FILE,
            },
        )
        cl8 = await probe(
            conn,
            "spec104_cl8",
            text(
                """
                insert into public.resources (
                  owner_id, formation_id, chapter_id, kind, origin, suggestion_status, title
                )
                values (cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid),
                        'web', 'tutor_suggestion', 'pending', :title)
                """
            ),
            {
                "owner": user.id,
                "formation": programme.formation_id,
                "chapter": chapter_id,
                "title": fixture.SPEC104_PENDING_TITLE,
            },
        )
        await conn.execute(
            text(
                """
                insert into public.resources (owner_id, formation_id, chapter_id, kind, title,
                                              content_text)
                select cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid),
                       'note', 'Contribution ' || i, 'Contenu ' || i
                from generate_series(1, 99) i
                """
            ),
            {
                "owner": user.id,
                "formation": programme.formation_id,
                "chapter": chapter_id,
            },
        )
        cl3 = await probe(
            conn,
            "spec104_cl3",
            text(
                """
                insert into public.resources (owner_id, formation_id, chapter_id, kind, title,
                                              content_text)
                values (cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid),
                        'note', :title, :content)
                """
            ),
            {
                "owner": user.id,
                "formation": programme.formation_id,
                "chapter": chapter_id,
                "title": fixture.SPEC104_EXTRA_TITLE,
                "content": fixture.SPEC104_EXTRA_CONTENT,
            },
        )

        chunks_before = await _chunks_104(conn, resource_id)
        await conn.execute(UPDATE_104_DELETE, {"resource": resource_id})
        chunks_after = await _chunks_104(conn, resource_id)
        retained = (await conn.execute(SELECT_104_RETAINED, {"resource": resource_id})).mappings().all()
        resource_rows = (await conn.execute(SELECT_104_RETAINED, {"resource": resource_id})).mappings().all()
    limits = []
    for key, expected, failure in (
        ("cl1", "resources_note_shape", cl1),
        ("cl2", "resource_pdf_limit", cl2),
        ("cl3", "chapter_resource_limit", cl3),
        ("cl8", "resources_link_shape", cl8),
    ):
        code = raised_code(failure["message"], RAISED_LIMIT_CODES, failure["code"])
        limits.append(
            {
                "key": key,
                "expected": expected,
                "sqlstate": failure["code"],
                "code": code,
                "ok": failure["code"] == "23514" and code == expected,
            }
        )
    return {
        "resource": {
            "title": fixture.SPEC104_RESOURCE_TITLE,
            "kind": "note",
            "status": "ready",
            "contentText": fixture.SPEC104_NOTE,
            "chunks": chunks_before,
        },
        "search": {
            "query": fixture.SPEC104_QUERY,
            "neighbours": [
                {
                    "position": int(row["position"]),
                    "text": str(row["text"]),
                    "distance": float(row["distance"]),
                }
                for row in neighbours
            ],
            "plan": plan,
            "indexUsed": "resource_chunks_embedding_hnsw_idx" in plan,
        },
        "limits": limits,
        "softDelete": {
            "title": "" if not resource_rows else str(resource_rows[0]["title"]),
            "before": len(chunks_before),
            "after": len(chunks_after),
            "retained": len(retained) == 1,
            "contentErased": bool(retained) and retained[0]["content_text"] is None,
        },
    }


# --- SPEC-105 -----------------------------------------------------------------------------------

SELECT_105_VERSIONS = text(
    """
    select version, status::text as status, is_current
    from public.courses
    where owner_id = cast(:owner as uuid) and module_id = cast(:module as uuid)
    order by version
    """
)
SELECT_105_CURRENT_COURSE = text(
    """
    select id::text as id from public.courses
    where owner_id = cast(:owner as uuid) and module_id = cast(:module as uuid)
      and version = :version
    """
)
INSERT_105_COURSE = text(
    """
    insert into public.courses (owner_id, formation_id, module_id, version, status)
    values (cast(:owner as uuid), cast(:formation as uuid), cast(:module as uuid), :version,
            'ready')
    returning id::text as id
    """
)
INSERT_105_SECTION = text(
    """
    insert into public.course_sections (
      course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin
    )
    values (cast(:course as uuid), cast(:owner as uuid), cast(:chapter as uuid), 1, 'text',
            :anchor, :title, :content, 'tutor')
    returning id::text as id
    """
)
UPDATE_105_SECTION = text(
    "update public.course_sections set content_md = :content where id = cast(:section as uuid)"
)
SELECT_105_SECTION = text(
    "select title, version from public.course_sections where id = cast(:section as uuid)"
)
SELECT_105_REVISIONS = text(
    """
    select version, title, edited_by
    from public.course_section_revisions
    where section_id = cast(:section as uuid)
    order by version
    """
)
INSERT_105_RESOURCE = text(
    """
    insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text,
                                  status)
    values (cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid), 'note',
            :title, :content, 'ready')
    returning id::text as id
    """
)
INSERT_105_CHUNK = text(
    """
    insert into public.resource_chunks (
      resource_id, owner_id, formation_id, chapter_id, position, text, location
    )
    values (
      cast(:resource as uuid), cast(:owner as uuid), cast(:formation as uuid),
      cast(:chapter as uuid), 0, :content, cast(:location as jsonb)
    )
    returning id::text as id
    """
)
INSERT_105_CITATION = text(
    """
    insert into public.citations (
      section_id, owner_id, chunk_id, resource_id, quote, location, label, media_kind
    )
    values (
      cast(:section as uuid), cast(:owner as uuid), cast(:chunk as uuid),
      cast(:resource as uuid), :quote, cast(:location as jsonb), :label,
      cast(:media_kind as public.citation_media)
    )
    returning id::text as id
    """
)
SELECT_105_CITATION = text(
    """
    select label, chunk_id::text as chunk_id, resource_id::text as resource_id
    from public.citations where id = cast(:citation as uuid)
    """
)
INSERT_105_CONVERSATION = text(
    """
    insert into public.tutor_conversations (user_id, course_id, title)
    values (cast(:user as uuid), cast(:course as uuid), :title)
    returning id::text as id
    """
)
INSERT_105_MESSAGE = text(
    """
    insert into public.tutor_messages (
      conversation_id, user_id, role, content, sources, created_at
    )
    values (
      cast(:conversation as uuid), cast(:user as uuid), cast(:role as public.message_role), :content,
      cast(:sources as jsonb), now() + cast(:offset as interval)
    )
    """
)
SELECT_105_MESSAGES = text(
    """
    select role::text as role, content, sources
    from public.tutor_messages
    where conversation_id = cast(:conversation as uuid)
    order by created_at, id
    """
)


async def _load_versions_105(conn: Any, owner_id: str, module_id: str) -> list[dict[str, Any]]:
    records = (
        (await conn.execute(SELECT_105_VERSIONS, {"owner": owner_id, "module": module_id})).mappings().all()
    )
    return [
        {
            "version": int(row["version"]),
            "status": str(row["status"]),
            "isCurrent": row["is_current"] is True,
        }
        for row in records
    ]


async def _load_section_105(conn: Any, section_id: str) -> dict[str, Any]:
    section = (await conn.execute(SELECT_105_SECTION, {"section": section_id})).mappings().first()
    revisions = (await conn.execute(SELECT_105_REVISIONS, {"section": section_id})).mappings().all()
    return {
        "title": "" if section is None else str(section["title"]),
        "currentVersion": 0 if section is None else int(section["version"]),
        "revisions": [
            {
                "version": int(row["version"]),
                "title": "" if row["title"] is None else str(row["title"]),
                "editedBy": str(row["edited_by"]),
            }
            for row in revisions
        ],
    }


async def _load_citation_105(conn: Any, citation_id: str) -> dict[str, Any]:
    row = (await conn.execute(SELECT_105_CITATION, {"citation": citation_id})).mappings().first()
    chunk_id = None if row is None or row["chunk_id"] is None else str(row["chunk_id"])
    resource_id = None if row is None or row["resource_id"] is None else str(row["resource_id"])
    return {
        "label": "" if row is None or row["label"] is None else str(row["label"]),
        "displayed": fixture.SPEC105_DELETED_SOURCE if chunk_id is None else fixture.SPEC105_SOURCE_LABEL,
        "chunkId": chunk_id,
        "resourceId": resource_id,
    }


async def _load_messages_105(conn: Any, conversation_id: str) -> list[dict[str, Any]]:
    records = (await conn.execute(SELECT_105_MESSAGES, {"conversation": conversation_id})).mappings().all()
    messages: list[dict[str, Any]] = []
    for row in records:
        sources = json_value(row["sources"])
        labels = (
            [
                "" if not isinstance(source, dict) or source.get("label") is None else str(source["label"])
                for source in sources
            ]
            if isinstance(sources, list)
            else []
        )
        messages.append({"role": str(row["role"]), "content": str(row["content"]), "sources": labels})
    return messages


async def spec_105(call: Call) -> dict[str, Any]:
    """`devSddSpec105Demo`: two course versions, a corrected section, a citation and a discussion."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        user = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-105-demo"), first_name="Alex"
        )
        programme = await create_programme(
            conn, user.id, modules=1, chapters_per_module=1, notions_per_chapter=0
        )
        module_id = programme.module_ids[0]
        chapter_id = programme.chapter_ids[0]

        await conn.execute(
            INSERT_105_COURSE,
            {
                "owner": user.id,
                "formation": programme.formation_id,
                "module": module_id,
                "version": 1,
            },
        )
        await conn.execute(
            INSERT_105_COURSE,
            {
                "owner": user.id,
                "formation": programme.formation_id,
                "module": module_id,
                "version": 2,
            },
        )
        versions = await _load_versions_105(conn, user.id, module_id)
        current = next((entry for entry in versions if entry["isCurrent"]), None)
        if current is None:
            raise LookupError("current course not found")
        course_row = (
            (
                await conn.execute(
                    SELECT_105_CURRENT_COURSE,
                    {"owner": user.id, "module": module_id, "version": current["version"]},
                )
            )
            .mappings()
            .first()
        )
        if course_row is None:
            raise LookupError("current course not found")
        course_id = str(course_row["id"])

        section_row = (
            (
                await conn.execute(
                    INSERT_105_SECTION,
                    {
                        "course": course_id,
                        "owner": user.id,
                        "chapter": chapter_id,
                        "anchor": fixture.SPEC105_SECTION_ANCHOR,
                        "title": fixture.SPEC105_SECTION_TITLE,
                        "content": fixture.SPEC105_SECTION_CONTENT,
                    },
                )
            )
            .mappings()
            .first()
        )
        if section_row is None:
            raise LookupError("demonstration section not created")
        section_id = str(section_row["id"])

        await conn.execute(text("select set_config('learny.actor', 'learner', true)"))
        await conn.execute(
            UPDATE_105_SECTION,
            {"section": section_id, "content": fixture.SPEC105_SECTION_EDIT},
        )
        await conn.execute(
            UPDATE_105_SECTION,
            {"section": section_id, "content": fixture.SPEC105_SECTION_EDIT_LAST},
        )

        resource_row = (
            (
                await conn.execute(
                    INSERT_105_RESOURCE,
                    {
                        "owner": user.id,
                        "formation": programme.formation_id,
                        "chapter": chapter_id,
                        "title": fixture.SPEC105_RESOURCE_TITLE,
                        "content": fixture.SPEC105_RESOURCE_TEXT,
                    },
                )
            )
            .mappings()
            .first()
        )
        resource_id = "" if resource_row is None else str(resource_row["id"])
        chunk_row = (
            (
                await conn.execute(
                    INSERT_105_CHUNK,
                    {
                        "resource": resource_id,
                        "owner": user.id,
                        "formation": programme.formation_id,
                        "chapter": chapter_id,
                        "content": fixture.SPEC105_CHUNK_TEXT,
                        "location": json.dumps({"charStart": 0, "charEnd": 24}),
                    },
                )
            )
            .mappings()
            .first()
        )
        chunk_id = "" if chunk_row is None else str(chunk_row["id"])
        citation_row = (
            (
                await conn.execute(
                    INSERT_105_CITATION,
                    {
                        "section": section_id,
                        "owner": user.id,
                        "chunk": chunk_id,
                        "resource": resource_id,
                        "quote": fixture.SPEC105_CHUNK_TEXT,
                        "location": json.dumps({"page": 4, "charStart": 0, "charEnd": 24}),
                        "label": fixture.SPEC105_SOURCE_LABEL,
                        "media_kind": "pdf",
                    },
                )
            )
            .mappings()
            .first()
        )
        citation_id = "" if citation_row is None else str(citation_row["id"])
        await conn.execute(UPDATE_104_DELETE, {"resource": resource_id})

        conversation_row = (
            (
                await conn.execute(
                    INSERT_105_CONVERSATION,
                    {
                        "user": user.id,
                        "course": course_id,
                        "title": fixture.SPEC105_CONVERSATION_TITLE,
                    },
                )
            )
            .mappings()
            .first()
        )
        conversation_id = "" if conversation_row is None else str(conversation_row["id"])
        sources = json.dumps([{"label": fixture.SPEC105_SOURCE_LABEL}], ensure_ascii=False)
        await conn.execute(
            INSERT_105_MESSAGE,
            {
                "conversation": conversation_id,
                "user": user.id,
                "role": "learner",
                "content": fixture.SPEC105_QUESTION,
                "sources": sources,
                "offset": "0 seconds",
            },
        )
        await conn.execute(
            INSERT_105_MESSAGE,
            {
                "conversation": conversation_id,
                "user": user.id,
                "role": "tutor",
                "content": fixture.SPEC105_ANSWER,
                "sources": sources,
                "offset": "1 second",
            },
        )

        section = await _load_section_105(conn, section_id)
        citation = await _load_citation_105(conn, citation_id)
        messages = await _load_messages_105(conn, conversation_id)

    return {
        "versions": versions,
        "section": section,
        "citation": citation,
        "messages": messages,
    }


# --- SPEC-106 -----------------------------------------------------------------------------------

SELECT_106_TYPES = text(
    """
    select type::text as type, purpose::text as purpose, status::text as status, current_version
    from public.bricks
    where owner_id = cast(:owner as uuid)
    order by array_position(enum_range(null::public.brick_type), type)
    """
)
INSERT_106_BRICK = text(
    """
    insert into public.bricks (owner_id, formation_id, type, purpose, status)
    values (cast(:owner as uuid), cast(:formation as uuid), cast(:type as public.brick_type),
            cast(:purpose as public.brick_purpose), cast(:status as public.brick_status))
    returning id::text as id
    """
)
SELECT_106_ACTIVITY = text(
    "select kind::text as kind, status::text as status from public.activities "
    "where id = cast(:activity as uuid)"
)
SELECT_106_ITEMS = text(
    """
    select item.ordinality as position, b.type::text as type, v.version as version,
           b.current_version, item.value ->> 'points' as points
    from public.activities a
    cross join lateral jsonb_array_elements(a.items) with ordinality as item(value, ordinality)
    join public.brick_versions v on v.id = (item.value ->> 'brickVersionId')::uuid
    join public.bricks b on b.id = v.brick_id
    where a.id = cast(:activity as uuid)
    order by item.ordinality
    """
)
SELECT_106_ATTEMPT = text(
    """
    select a.attempt_no, a.status::text as status, a.score, a.passed,
           (select count(*)::int from public.answers where attempt_id = a.id) as answers
    from public.attempts a
    where a.id = cast(:attempt as uuid)
    """
)
SELECT_106_ANSWERS = text(
    """
    select a.position, b.type::text as type, v.version, b.current_version, a.is_correct, a.score,
           a.max_score, a.graded_by::text as graded_by
    from public.answers a
    join public.brick_versions v on v.id = a.brick_version_id
    join public.bricks b on b.id = v.brick_id
    where a.attempt_id = cast(:attempt as uuid)
    order by a.position
    """
)
UPDATE_106_ATTEMPT = text(
    """
    update public.attempts
    set status = 'graded', score = 50, passed = false, duration_ms = 27000, submitted_at = now()
    where id = cast(:attempt as uuid)
    """
)


def _purpose_for(index: int) -> str:
    return BRICK_PURPOSES[index % len(BRICK_PURPOSES)]


def _status_for(index: int) -> str:
    if index == 11:
        return "reported"
    if index == 12:
        return "retired"
    return "active"


async def spec_106(call: Call) -> dict[str, Any]:
    """`devSddSpec106Demo`: thirteen bricks, three versions, a graded attempt and its answers."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        user = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-106-demo"), first_name="Alex"
        )
        programme = await create_programme(
            conn, user.id, modules=1, chapters_per_module=1, notions_per_chapter=2
        )

        brick_ids: list[str] = []
        for index, brick_type in enumerate(BRICK_TYPES):
            row = (
                (
                    await conn.execute(
                        INSERT_106_BRICK,
                        {
                            "owner": user.id,
                            "formation": programme.formation_id,
                            "type": brick_type,
                            "purpose": _purpose_for(index),
                            "status": _status_for(index),
                        },
                    )
                )
                .mappings()
                .first()
            )
            if row is None:
                raise LookupError("demonstration brick not created")
            brick_ids.append(str(row["id"]))

        activity_brick = brick_ids[2]
        version_ids: list[str] = []
        for version_number in (1, 2, 3):
            version_ids.append(
                await add_brick_version(
                    conn,
                    brick_id=activity_brick,
                    version=version_number,
                    payload={
                        "statement": fixture.SPEC106_STATEMENT.format(version=version_number),
                        "sample": True,
                    },
                    origin="tutor",
                    created_by="tutor",
                )
            )

        activity_id = await create_activity(
            conn,
            owner_id=user.id,
            formation_id=programme.formation_id,
            module_id=programme.module_ids[0],
            kind="validation_quiz",
            config={"threshold": 80, "durationSec": 1800, "questionCount": 3, "hintsMax": 2},
            items=[
                {"brickId": activity_brick, "brickVersionId": version_id, "points": 1}
                for version_id in version_ids
            ],
            status="ready",
            for_date="2026-11-11",
        )
        attempt_id = await create_attempt(conn, user_id=user.id, activity_id=activity_id)

        await record_answer(
            conn,
            attempt_id=attempt_id,
            brick_version_id=version_ids[0],
            position=1,
            response={"choice": "401"},
            is_correct=True,
            score=1,
            max_score=1,
            time_ms=4200,
            graded_by="code",
            feedback={"explanation": fixture.SPEC106_EXPLANATION, "criteria": []},
        )
        await record_answer(
            conn,
            attempt_id=attempt_id,
            brick_version_id=version_ids[1],
            position=2,
            response={"choice": "512"},
            is_correct=False,
            score=0,
            max_score=1,
            time_ms=7800,
            graded_by="code",
            chosen_distractor_notion_id=programme.notion_ids[0],
            marked_for_review=True,
        )
        await record_answer(
            conn,
            attempt_id=attempt_id,
            brick_version_id=version_ids[2],
            position=3,
            response={"text": fixture.SPEC106_RESPONSE},
            is_correct=True,
            score=0.5,
            max_score=1,
            time_ms=15000,
            graded_by="tutor",
            feedback={
                "explanation": fixture.SPEC106_PARTIAL_EXPLANATION,
                "criteria": [
                    {
                        "key": "sens",
                        "ok": True,
                        "comment": fixture.SPEC106_CRITERION_COMMENT,
                    }
                ],
                "missing": ["contrepartie"],
            },
        )
        await conn.execute(UPDATE_106_ATTEMPT, {"attempt": attempt_id})

        await add_brick_version(
            conn,
            brick_id=activity_brick,
            version=4,
            payload={"statement": fixture.SPEC106_CORRECTED_STATEMENT, "sample": True},
            origin="tutor",
            created_by="tutor",
        )

        type_rows = (await conn.execute(SELECT_106_TYPES, {"owner": user.id})).mappings().all()
        activity_row = (await conn.execute(SELECT_106_ACTIVITY, {"activity": activity_id})).mappings().first()
        item_rows = (await conn.execute(SELECT_106_ITEMS, {"activity": activity_id})).mappings().all()
        attempt_row = (await conn.execute(SELECT_106_ATTEMPT, {"attempt": attempt_id})).mappings().first()
        answer_rows = (await conn.execute(SELECT_106_ANSWERS, {"attempt": attempt_id})).mappings().all()

    return {
        "types": [
            {
                "type": str(row["type"]),
                "purpose": str(row["purpose"]),
                "status": str(row["status"]),
                "currentVersion": int(row["current_version"]),
            }
            for row in type_rows
        ],
        "activity": {
            "kind": "" if activity_row is None else str(activity_row["kind"]),
            "status": "" if activity_row is None else str(activity_row["status"]),
            "items": [
                {
                    "position": int(row["position"]),
                    "type": str(row["type"]),
                    "version": int(row["version"]),
                    "availableVersion": int(row["current_version"]),
                    "points": number(row["points"]),
                }
                for row in item_rows
            ],
        },
        "attempt": {
            "attemptNo": 0 if attempt_row is None else int(attempt_row["attempt_no"]),
            "status": "" if attempt_row is None else str(attempt_row["status"]),
            "score": None if attempt_row is None else number(attempt_row["score"]),
            "passed": None
            if attempt_row is None or not isinstance(attempt_row["passed"], bool)
            else attempt_row["passed"],
            "answers": 0 if attempt_row is None else int(attempt_row["answers"]),
        },
        "answers": [
            {
                "position": int(row["position"]),
                "type": str(row["type"]),
                "version": int(row["version"]),
                "currentVersion": int(row["current_version"]),
                "isCorrect": row["is_correct"] if isinstance(row["is_correct"], bool) else None,
                "score": number(row["score"]),
                "maxScore": number(row["max_score"]),
                "gradedBy": None if row["graded_by"] is None else str(row["graded_by"]),
            }
            for row in answer_rows
        ],
    }


# --- SPEC-107 -----------------------------------------------------------------------------------

SELECT_107_CARDS = text(
    """
    select s.notion_id::text as notion_id, n.label, s.due_at, s.mastery::text as mastery,
           s.in_review, s.suspended, s.fsrs
    from public.notion_states s
    join public.notions n on n.id = s.notion_id
    where s.user_id = cast(:user as uuid)
    order by n.position, n.id
    """
)
SELECT_107_NOTION_LABEL = text("select label from public.notions where id = cast(:notion as uuid)")
COUNT_107_STATES = text(
    "select count(*)::int as count from public.notion_states where user_id = cast(:user as uuid)"
)


def _empty_card(due: str) -> dict[str, Any]:
    return {
        "due": due,
        "stability": 0,
        "difficulty": 0,
        "elapsed_days": 0,
        "scheduled_days": 0,
        "reps": 0,
        "lapses": 0,
        "state": 0,
        "last_review": None,
    }


def _reviewed_card(
    *,
    due: str,
    reps: int,
    state: int,
    last_review: str,
    stability: float,
    difficulty: float,
    scheduled_days: int,
    lapses: int = 0,
) -> dict[str, Any]:
    return {
        "due": due,
        "stability": stability,
        "difficulty": difficulty,
        "elapsed_days": 0,
        "scheduled_days": scheduled_days,
        "reps": reps,
        "lapses": lapses,
        "state": state,
        "last_review": last_review,
    }


async def _load_cards_107(conn: Any, user_id: str) -> list[dict[str, Any]]:
    records = (await conn.execute(SELECT_107_CARDS, {"user": user_id})).mappings().all()
    return [
        {
            "notionId": str(row["notion_id"]),
            "label": "" if row["label"] is None else str(row["label"]),
            "dueAt": None if row["due_at"] is None else to_iso(row["due_at"]),
            "mastery": number(row["mastery"]),
            "inReview": row["in_review"] is True,
            "suspended": row["suspended"] is True,
            "fsrs": json_value(row["fsrs"]),
        }
        for row in records
    ]


def _active_gap(state: Any, confused_label: str) -> dict[str, Any]:
    natures = list(GAP_NATURES)
    if state is None or state["gap_nature"] is None or state["gap_cleared_at"] is not None:
        return {
            "active": False,
            "nature": None,
            "confusedWithLabel": None,
            "detectedAt": None,
            "evidence": None,
            "natures": natures,
        }
    evidence: dict[str, Any] | None = None
    raw = state["gap_evidence"]
    if raw is not None:
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            evidence = parsed
    return {
        "active": True,
        "nature": str(state["gap_nature"]),
        "confusedWithLabel": confused_label,
        "detectedAt": None if state["gap_detected_at"] is None else to_iso(state["gap_detected_at"]),
        "evidence": evidence,
        "natures": natures,
    }


async def spec_107(call: Call) -> dict[str, Any]:
    """`devSddSpec107Demo`: three notion states, the review history, the gap and the isolation."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        user = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-107-demo"), first_name="Alex"
        )
        programme = await create_programme(
            conn, user.id, modules=1, chapters_per_module=1, notions_per_chapter=3
        )
        first, second, third = programme.notion_ids[0:3]

        await create_notion_state(
            conn,
            user_id=user.id,
            notion_id=first,
            fsrs=_empty_card(FIXED),
            due_at=None,
            in_review=True,
        )
        await apply_review(
            conn,
            user_id=user.id,
            notion_id=first,
            expected_revision=0,
            fsrs_before=_empty_card(FIXED),
            fsrs_after=_reviewed_card(
                due=FIRST_DUE,
                reps=1,
                state=1,
                last_review=FIRST_REVIEW,
                stability=1.2,
                difficulty=5.4,
                scheduled_days=0,
            ),
            mastery=60,
            success_count=1,
            in_review=True,
            reviewed_at=FIRST_REVIEW,
            source="validation",
            grade="hard",
            correct=True,
            time_ms=5200,
        )
        await apply_review(
            conn,
            user_id=user.id,
            notion_id=first,
            expected_revision=1,
            fsrs_before=_reviewed_card(
                due=FIRST_DUE,
                reps=1,
                state=1,
                last_review=FIRST_REVIEW,
                stability=1.2,
                difficulty=5.4,
                scheduled_days=1,
            ),
            fsrs_after=_reviewed_card(
                due=SECOND_DUE,
                reps=2,
                state=1,
                last_review=SECOND_REVIEW,
                stability=2.4,
                difficulty=4.6,
                scheduled_days=0,
            ),
            mastery=82.5,
            success_count=2,
            in_review=True,
            reviewed_at=SECOND_REVIEW,
            source="global_quiz",
            grade="good",
            correct=True,
            time_ms=3100,
        )

        await create_notion_state(
            conn,
            user_id=user.id,
            notion_id=second,
            fsrs=_empty_card(FIXED),
            due_at=None,
            in_review=True,
        )
        await apply_review(
            conn,
            user_id=user.id,
            notion_id=second,
            expected_revision=0,
            fsrs_before=_empty_card(FIXED),
            fsrs_after=_reviewed_card(
                due=GAP_DUE,
                reps=1,
                state=3,
                last_review=GAP_REVIEW,
                stability=0.4,
                difficulty=8.1,
                scheduled_days=1,
                lapses=1,
            ),
            mastery=45,
            success_count=0,
            in_review=True,
            reviewed_at=GAP_REVIEW,
            source="global_quiz",
            grade="again",
            correct=False,
            time_ms=18000,
        )
        await detect_gap(
            conn,
            user_id=user.id,
            notion_id=second,
            expected_revision=1,
            nature="confusion",
            confused_with=third,
            evidence={
                "chosen": fixture.SPEC107_EVIDENCE_CHOSEN,
                "expected": fixture.SPEC107_EVIDENCE_EXPECTED,
                "answerId": None,
            },
            detected_at=GAP_DETECTED,
        )

        await create_notion_state(
            conn,
            user_id=user.id,
            notion_id=third,
            fsrs=_empty_card(FIXED),
            due_at=None,
            in_review=False,
        )

        foreign = await create_user(
            conn,
            email=demo_email(call.deps.clock.now(), "spec-107-foreign"),
            first_name=fixture.SPEC107_FOREIGN_FIRST_NAME,
        )
        foreign_programme = await create_programme(
            conn,
            foreign.id,
            modules=1,
            chapters_per_module=1,
            notions_per_chapter=1,
            title=fixture.SPEC107_FOREIGN_FORMATION,
        )
        foreign_notion = foreign_programme.notion_ids[0]
        await create_notion_state(
            conn,
            user_id=foreign.id,
            notion_id=foreign_notion,
            fsrs=_empty_card(FIXED),
            due_at=FIXED,
            in_review=True,
        )

        due = await get_due_notion_states(conn, user_id=user.id, now=FIXED)
        state_b = next((row for row in due if str(row["notion_id"]) == second), None)
        history = await get_review_history(conn, user_id=user.id, notion_id=first)
        confused_row = (await conn.execute(SELECT_107_NOTION_LABEL, {"notion": third})).mappings().first()
        confused_label = "" if confused_row is None else str(confused_row["label"])
        foreign_count = (await conn.execute(COUNT_107_STATES, {"user": foreign.id})).mappings().first()
        cards = await _load_cards_107(conn, user.id)

    return {
        "dueCount": len(due),
        "states": cards,
        "gap": _active_gap(state_b, confused_label),
        "history": [
            {
                "reviewedAt": to_iso(row["reviewed_at"]),
                "source": str(row["source"]),
                "grade": str(row["grade"]),
                "correct": row["correct"] if isinstance(row["correct"], bool) else None,
                "timeMs": None if row["time_ms"] is None else int(row["time_ms"]),
                "before": json_value(row["fsrs_before"]),
                "after": json_value(row["fsrs_after"]),
            }
            for row in history
        ],
        "isolation": {
            "foreignStates": 0 if foreign_count is None else int(foreign_count["count"]),
            "foreignVisible": 1 if any(str(row["notion_id"]) == foreign_notion for row in due) else 0,
        },
    }


# --- SPEC-108 -----------------------------------------------------------------------------------

INSERT_108_SLOT = text(
    """
    insert into public.schedule_slots (
      user_id, formation_id, module_id, kind, title, starts_at, ends_at, created_by,
      group_milestone
    )
    values (
      cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
      cast(:kind as public.slot_kind), :title, cast(:starts as timestamptz),
      cast(:ends as timestamptz), cast(:created_by as public.slot_creator), false
    )
    returning id::text as id
    """
)
SELECT_108_SLOT_LOCKED = text(
    """
    select id::text as id, formation_id::text as formation_id, module_id::text as module_id,
           kind::text as kind, title, meta, starts_at, ends_at, status::text as status,
           activity_id::text as activity_id, created_by::text as created_by,
           moved_from_id::text as moved_from_id, group_milestone
    from public.schedule_slots
    where id = cast(:slot as uuid) and user_id = cast(:user as uuid)
    for update
    """
)
UPDATE_108_SLOT_STATUS = text(
    "update public.schedule_slots set status = cast(:status as public.slot_status) "
    "where id = cast(:slot as uuid) and user_id = cast(:user as uuid) "
    "returning id::text as id"
)
INSERT_108_SUCCESSOR = text(
    """
    insert into public.schedule_slots (
      user_id, formation_id, module_id, kind, title, meta, starts_at, ends_at, status,
      activity_id, created_by, moved_from_id, group_milestone
    )
    values (
      cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
      cast(:kind as public.slot_kind), :title, :meta, cast(:starts as timestamptz),
      cast(:ends as timestamptz), 'planned', cast(:activity as uuid),
      cast(:created_by as public.slot_creator), cast(:origin as uuid), :group_milestone
    )
    returning id::text as id
    """
)
SELECT_108_SLOTS = text(
    """
    select id::text as id, title, kind::text as kind, status::text as status,
           created_by::text as created_by, starts_at, ends_at, moved_from_id::text as moved_from_id
    from public.schedule_slots
    where user_id = cast(:user as uuid)
      and starts_at < cast(:to as timestamptz) and ends_at > cast(:from as timestamptz)
    order by starts_at, id
    """
)
SELECT_108_DAILY = text(
    "select day::text as day, minutes, qualifying, sources from public.daily_activity "
    "where user_id = cast(:user as uuid) and day = cast(:day as date)"
)
INSERT_108_DAILY = text(
    """
    insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
    values (cast(:user as uuid), cast(:day as date), :minutes, :qualifying,
            cast(:sources as text[]))
    """
)
UPDATE_108_DAILY = text(
    """
    update public.daily_activity set minutes = :minutes, qualifying = :qualifying,
           sources = cast(:sources as text[])
    where user_id = cast(:user as uuid) and day = cast(:day as date)
    """
)
INSERT_108_MILESTONE = text(
    """
    insert into public.milestones (user_id, formation_id, key, ref_id, achieved_at)
    values (cast(:user as uuid), cast(:formation as uuid),
            cast(:key as public.milestone_key), cast(:ref as uuid),
            cast(:achieved_at as timestamptz))
    on conflict (user_id, key, ref_id) do nothing
    """
)
SELECT_108_MILESTONES = text(
    """
    select key::text as key, ref_id::text as ref_id, achieved_at
    from public.milestones
    where user_id = cast(:user as uuid)
    order by achieved_at desc, id desc
    limit 20
    """
)
INSERT_108_ACTION = text(
    """
    insert into public.automation_actions (
      user_id, formation_id, automation, kind, summary, payload, undo_payload,
      requires_consent, status, created_at
    )
    values (
      cast(:user as uuid), cast(:formation as uuid),
      cast(:automation as public.automation_key), :kind, :summary, cast(:payload as jsonb),
      cast(:undo_payload as jsonb), :requires_consent, 'pending_consent',
      cast(:created_at as timestamptz)
    )
    """
)
SELECT_108_ACTIONS = text(
    """
    select automation::text as automation, kind, summary, status::text as status,
           requires_consent, created_at, payload
    from public.automation_actions
    where user_id = cast(:user as uuid)
    order by created_at desc, id desc
    limit 5
    """
)


async def _create_slot_108(
    conn: Any,
    *,
    user_id: str,
    formation_id: str,
    module_id: str,
    kind: str,
    title: str,
    starts_at: str,
    ends_at: str,
    created_by: str,
) -> str:
    row = (
        (
            await conn.execute(
                INSERT_108_SLOT,
                {
                    "user": user_id,
                    "formation": formation_id,
                    "module": module_id,
                    "kind": kind,
                    "title": title,
                    "starts": starts_at,
                    "ends": ends_at,
                    "created_by": created_by,
                },
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise LookupError("schedule slot not created")
    return str(row["id"])


async def _move_slot_108(conn: Any, *, user_id: str, slot_id: str, starts_at: str, ends_at: str) -> str:
    origin = (
        (await conn.execute(SELECT_108_SLOT_LOCKED, {"slot": slot_id, "user": user_id})).mappings().first()
    )
    if origin is None:
        raise LookupError("schedule slot not found")
    await conn.execute(UPDATE_108_SLOT_STATUS, {"slot": slot_id, "user": user_id, "status": "moved"})
    row = (
        (
            await conn.execute(
                INSERT_108_SUCCESSOR,
                {
                    "user": user_id,
                    "formation": origin["formation_id"],
                    "module": origin["module_id"],
                    "kind": origin["kind"],
                    "title": origin["title"],
                    "meta": origin["meta"],
                    "starts": starts_at,
                    "ends": ends_at,
                    "activity": origin["activity_id"],
                    "created_by": "learner",
                    "origin": slot_id,
                    "group_milestone": origin["group_milestone"],
                },
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise LookupError("moved schedule slot not created")
    return str(row["id"])


async def _set_slot_status_108(conn: Any, *, user_id: str, slot_id: str, status: str) -> None:
    await conn.execute(UPDATE_108_SLOT_STATUS, {"slot": slot_id, "user": user_id, "status": status})


async def _upsert_daily_108(
    conn: Any,
    *,
    user_id: str,
    day: str,
    minutes: int,
    qualifying: bool,
    sources: list[str],
) -> None:
    """The upsert of `upsertDailyActivity`: a replay of known sources adds nothing (CL-5)."""
    existing = (await conn.execute(SELECT_108_DAILY, {"user": user_id, "day": day})).mappings().first()
    if existing is None:
        await conn.execute(
            INSERT_108_DAILY,
            {
                "user": user_id,
                "day": day,
                "minutes": minutes,
                "qualifying": qualifying,
                "sources": sources,
            },
        )
        return
    current_sources = list(existing["sources"])
    replay = bool(sources) and all(source in current_sources for source in sources)
    merged = sorted(set(current_sources) | set(sources))
    await conn.execute(
        UPDATE_108_DAILY,
        {
            "user": user_id,
            "day": day,
            "minutes": int(existing["minutes"]) + (0 if replay else minutes),
            "qualifying": bool(existing["qualifying"]) or (not replay and qualifying),
            "sources": merged,
        },
    )


async def _record_milestone_108(
    conn: Any, *, user_id: str, formation_id: str, key: str, ref_id: str | None, achieved_at: str
) -> None:
    await conn.execute(
        INSERT_108_MILESTONE,
        {
            "user": user_id,
            "formation": formation_id,
            "key": key,
            "ref": ref_id,
            "achieved_at": achieved_at,
        },
    )


async def spec_108(call: Call) -> dict[str, Any]:
    """`devSddSpec108Demo`: five slots, a consent action, the daily activity and two milestones."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        user = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-108-demo"), first_name="Alex"
        )
        programme = await create_programme(
            conn, user.id, modules=1, chapters_per_module=1, notions_per_chapter=1
        )
        module_id = programme.module_ids[0]

        origin_id = await _create_slot_108(
            conn,
            user_id=user.id,
            formation_id=programme.formation_id,
            module_id=module_id,
            kind="course",
            title=fixture.SPEC108_ORIGIN_TITLE,
            starts_at="2026-11-11T17:00:00Z",
            ends_at="2026-11-11T18:00:00Z",
            created_by="planner",
        )
        successor_id = await _move_slot_108(
            conn,
            user_id=user.id,
            slot_id=origin_id,
            starts_at="2026-11-12T17:00:00Z",
            ends_at="2026-11-12T18:00:00Z",
        )
        done_id = await _create_slot_108(
            conn,
            user_id=user.id,
            formation_id=programme.formation_id,
            module_id=module_id,
            kind="validation_quiz",
            title=fixture.SPEC108_DONE_TITLE,
            starts_at="2026-11-10T17:00:00Z",
            ends_at="2026-11-10T17:30:00Z",
            created_by="planner",
        )
        await _set_slot_status_108(conn, user_id=user.id, slot_id=done_id, status="done")
        missed_id = await _create_slot_108(
            conn,
            user_id=user.id,
            formation_id=programme.formation_id,
            module_id=module_id,
            kind="exercise",
            title=fixture.SPEC108_MISSED_TITLE,
            starts_at="2026-11-09T17:00:00Z",
            ends_at="2026-11-09T17:30:00Z",
            created_by="planner",
        )
        await _set_slot_status_108(conn, user_id=user.id, slot_id=missed_id, status="missed")
        cancelled_id = await _create_slot_108(
            conn,
            user_id=user.id,
            formation_id=programme.formation_id,
            module_id=module_id,
            kind="revision",
            title=fixture.SPEC108_CANCELLED_TITLE,
            starts_at="2026-11-08T18:00:00Z",
            ends_at="2026-11-08T18:30:00Z",
            created_by="planner",
        )
        await _set_slot_status_108(conn, user_id=user.id, slot_id=cancelled_id, status="cancelled")

        await _upsert_daily_108(
            conn,
            user_id=user.id,
            day="2026-11-11",
            minutes=30,
            qualifying=True,
            sources=["attempt:1"],
        )
        await _upsert_daily_108(
            conn,
            user_id=user.id,
            day="2026-11-11",
            minutes=15,
            qualifying=True,
            sources=["slot:2"],
        )
        await _record_milestone_108(
            conn,
            user_id=user.id,
            formation_id=programme.formation_id,
            key="module_validated",
            ref_id=module_id,
            achieved_at="2026-11-09T17:31:00Z",
        )
        await _record_milestone_108(
            conn,
            user_id=user.id,
            formation_id=programme.formation_id,
            key="streak_30",
            ref_id=None,
            achieved_at="2026-11-10T07:00:00Z",
        )
        await conn.execute(
            INSERT_108_ACTION,
            {
                "user": user.id,
                "formation": programme.formation_id,
                "automation": "reprise",
                "kind": "slot_rescheduled",
                "summary": fixture.SPEC108_ACTION_SUMMARY,
                "payload": json.dumps(
                    {
                        "slotId": successor_id,
                        "from": "2026-11-11T17:00:00.000Z",
                        "to": "2026-11-12T17:00:00.000Z",
                    },
                    ensure_ascii=False,
                ),
                "undo_payload": json.dumps({"slotId": successor_id}),
                "requires_consent": True,
                "created_at": FIXED,
            },
        )

        slot_rows = (
            (
                await conn.execute(
                    SELECT_108_SLOTS,
                    {
                        "user": user.id,
                        "from": "2026-11-08T00:00:00Z",
                        "to": "2026-11-14T00:00:00Z",
                    },
                )
            )
            .mappings()
            .all()
        )
        daily_row = (
            (await conn.execute(SELECT_108_DAILY, {"user": user.id, "day": "2026-11-11"})).mappings().first()
        )
        action_row = (await conn.execute(SELECT_108_ACTIONS, {"user": user.id})).mappings().first()
        milestone_rows = (await conn.execute(SELECT_108_MILESTONES, {"user": user.id})).mappings().all()

    starts_by_id = {str(row["id"]): to_iso(row["starts_at"]) for row in slot_rows}
    if action_row is None:
        raise LookupError("demonstration action missing")
    return {
        "slots": [
            {
                "id": str(row["id"]),
                "title": str(row["title"]),
                "kind": str(row["kind"]),
                "status": str(row["status"]),
                "createdBy": str(row["created_by"]),
                "startsAt": to_iso(row["starts_at"]),
                "endsAt": to_iso(row["ends_at"]),
                "movedFromStartsAt": None
                if row["moved_from_id"] is None
                else starts_by_id.get(str(row["moved_from_id"])),
            }
            for row in slot_rows
        ],
        "action": {
            "automation": str(action_row["automation"]),
            "kind": str(action_row["kind"]),
            "summary": str(action_row["summary"]),
            "status": str(action_row["status"]),
            "requiresConsent": action_row["requires_consent"] is True,
            "createdAt": to_iso(action_row["created_at"]),
            "payload": json_value(action_row["payload"]),
        },
        "daily": None
        if daily_row is None
        else {
            "day": str(daily_row["day"]),
            "minutes": int(daily_row["minutes"]),
            "qualifying": daily_row["qualifying"] is True,
            "sources": list(daily_row["sources"]),
        },
        "milestones": [
            {
                "key": str(row["key"]),
                "refId": None if row["ref_id"] is None else str(row["ref_id"]),
                "achievedAt": to_iso(row["achieved_at"]),
            }
            for row in milestone_rows
        ],
    }


# --- SPEC-111 -----------------------------------------------------------------------------------

SELECT_111_GROUP = text(
    "select id::text as id, invite_code, max_members from public.groups where id = cast(:group as uuid)"
)
SELECT_111_PROGRESS = text(
    """
    select group_id::text as group_id, user_id::text as user_id, first_name,
           current_module_position, validated_modules, streak_days
    from public.group_member_progress
    where group_id = cast(:group as uuid)
    order by first_name nulls last, user_id
    """
)
COUNT_111_ACTIVE = text("select public.count_active_formations(cast(:user as uuid)) as count")
INSERT_111_MODULE_PROGRESS = text(
    """
    insert into public.module_progress (user_id, module_id, status, validated_at)
    values (cast(:user as uuid), cast(:module as uuid),
            cast(:status as public.module_status), cast(:validated_at as timestamptz))
    """
)
UPDATE_111_STREAK = text("update public.profiles set streak_days = :streak where id = cast(:user as uuid)")
SET_CLAIMS = text(
    "select set_config('request.jwt.claims', :claims, true), set_config('request.jwt.claim.sub', :sub, true)"
)


def claims_of(user_id: str) -> str:
    """The Supabase claims of a demonstration identity (`buildUserClaims`)."""
    return json.dumps(
        {"sub": user_id, "role": "authenticated", "aud": "authenticated", "email": ""},
        ensure_ascii=False,
        separators=(",", ":"),
    )


async def as_user_rows(
    conn: Any, name: str, user_id: str, statement: Any, params: dict[str, Any] | None = None
) -> list[Any] | None:
    """Runs one read as `authenticated` inside a savepoint; `None` when the probe is refused."""
    await conn.execute(text(f"savepoint {name}"))
    try:
        await conn.execute(SET_CLAIMS, {"claims": claims_of(user_id), "sub": user_id})
        await conn.execute(text("set local role authenticated"))
        result = await conn.execute(statement, params or {})
        return list(result.mappings().all())
    except DBAPIError:
        return None
    finally:
        await conn.execute(text(f"rollback to savepoint {name}"))
        await conn.execute(text(f"release savepoint {name}"))


async def spec_111(call: Call) -> dict[str, Any]:
    """`devSddSpec111Demo`: a group of three, the limited progress view and the active counter."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        owner = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-111-owner"), first_name="Alice"
        )
        programme = await create_programme(
            conn,
            owner.id,
            modules=2,
            chapters_per_module=1,
            notions_per_chapter=1,
            title=fixture.SPEC111_PROGRAMME_TITLE,
        )
        first_module, second_module = programme.module_ids[0], programme.module_ids[1]
        group_id = await create_group(
            conn,
            formation_id=programme.formation_id,
            owner_id=owner.id,
            invite_code=fixture.SPEC111_INVITE_CODE,
        )
        bob = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-111-bob"), first_name="Bob"
        )
        carol = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-111-carol"), first_name="Carol"
        )
        for member in (bob, carol):
            await join_group(conn, group_id, member.id, joined_at=FIXED)

        for user_id, module_id, status, validated_at in (
            (owner.id, first_module, "validated", FIXED),
            (owner.id, second_module, "open", None),
            (bob.id, first_module, "validated", FIXED),
        ):
            await conn.execute(
                INSERT_111_MODULE_PROGRESS,
                {
                    "user": user_id,
                    "module": module_id,
                    "status": status,
                    "validated_at": validated_at,
                },
            )
        await conn.execute(UPDATE_111_STREAK, {"user": bob.id, "streak": 7})
        await conn.execute(UPDATE_111_STREAK, {"user": carol.id, "streak": 3})

        progress_rows = await as_user_rows(
            conn, "spec111_progress", owner.id, SELECT_111_PROGRESS, {"group": group_id}
        )
        group_row = (await conn.execute(SELECT_111_GROUP, {"group": group_id})).mappings().first()
        active_row = (await conn.execute(COUNT_111_ACTIVE, {"user": owner.id})).mappings().first()
    if group_row is None:
        raise LookupError("demonstration group missing")
    progress = [
        {
            "groupId": str(row["group_id"]),
            "userId": str(row["user_id"]),
            "firstName": None if row["first_name"] is None else str(row["first_name"]),
            "currentModulePosition": int(row["current_module_position"]),
            "validatedModules": int(row["validated_modules"]),
            "streakDays": int(row["streak_days"]),
        }
        for row in (progress_rows or [])
    ]
    return {
        "code": str(group_row["invite_code"]),
        "capacity": {"used": len(progress), "max": int(group_row["max_members"])},
        "progress": progress,
        "activeCount": 0 if active_row is None else int(active_row["count"]),
    }


# --- SPEC-112 -----------------------------------------------------------------------------------

SELECT_112_EXPORTS = text(
    """
    select id::text as id, status::text as status, size_bytes, created_at, expires_at, storage_path
    from public.data_exports
    where user_id = cast(:user as uuid)
    order by created_at desc, id desc
    limit 20
    """
)
INSERT_112_EXPORT = text(
    """
    insert into public.data_exports (user_id, status, created_at)
    values (cast(:user as uuid), 'queued', cast(:created_at as timestamptz))
    returning id::text as id
    """
)
COMPLETE_112_EXPORT = text(
    """
    update public.data_exports
    set status = 'done', storage_path = :path, size_bytes = :size, expires_at = cast(:expires as timestamptz)
    where id = cast(:export as uuid) and user_id = cast(:user as uuid)
    """
)
INSERT_112_ACCEPTANCE = text(
    """
    insert into public.legal_acceptances (user_id, document, version, accepted_at)
    values (cast(:user as uuid), cast(:document as public.legal_document), :version,
            cast(:accepted_at as timestamptz))
    on conflict (user_id, document, version) do nothing
    """
)
SELECT_112_ACCEPTANCES = text(
    """
    select id::text as id, document::text as document, version, accepted_at
    from public.legal_acceptances
    where user_id = cast(:user as uuid)
    order by accepted_at desc, id desc
    """
)
INSERT_112_IDEMPOTENCY = text(
    """
    insert into public.idempotency_keys (user_id, key, route, request_hash, created_at)
    values (cast(:user as uuid), :key, :route, :request_hash, cast(:created_at as timestamptz))
    """
)
COMPLETE_112_IDEMPOTENCY = text(
    """
    update public.idempotency_keys
    set status_code = :status_code, response = cast(:response as jsonb),
        completed_at = cast(:completed_at as timestamptz)
    where user_id = cast(:user as uuid) and key = :key
    """
)
SELECT_112_IDEMPOTENCY = text(
    """
    select key, status_code, created_at, completed_at, response
    from public.idempotency_keys
    where user_id = cast(:user as uuid)
    order by created_at desc
    """
)
SELECT_112_SEARCH = text(
    "select kind, id::text as id, title, snippet, href, rank from public.search_user_content(:query, :limit)"
)
SEARCH_KINDS = ("formation", "notion", "section")


def normalize_query(value: str) -> str:
    """`normalizeSearchQuery`: NFKC, collapsed whitespace, trim and a hard bound."""
    normalized = unicodedata.normalize("NFKC", value)
    collapsed = " ".join(normalized.split())
    return collapsed.strip()[:100]


def request_hash(method: str, route: str, body: Any) -> str:
    """A stable SHA-256 fingerprint of one idempotent request (ADR-0120)."""
    payload = json.dumps(
        {"method": method, "route": route, "body": body},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def _create_export_112(conn: Any, *, user_id: str, created_at: str) -> str:
    row = (
        (await conn.execute(INSERT_112_EXPORT, {"user": user_id, "created_at": created_at}))
        .mappings()
        .first()
    )
    if row is None:
        raise LookupError("data export not created")
    return str(row["id"])


async def _complete_export_112(
    conn: Any,
    *,
    user_id: str,
    export_id: str,
    path: str,
    size: int,
    expires_at: str,
) -> None:
    await conn.execute(
        COMPLETE_112_EXPORT,
        {"export": export_id, "user": user_id, "path": path, "size": size, "expires": expires_at},
    )


async def _accept_112(conn: Any, *, user_id: str, document: str, version: str, accepted_at: str) -> None:
    await conn.execute(
        INSERT_112_ACCEPTANCE,
        {
            "user": user_id,
            "document": document,
            "version": version,
            "accepted_at": accepted_at,
        },
    )


async def _reserve_112(conn: Any, *, user_id: str, key: str, route: str, body: Any, created_at: str) -> None:
    await conn.execute(
        INSERT_112_IDEMPOTENCY,
        {
            "user": user_id,
            "key": key,
            "route": route,
            "request_hash": request_hash("POST", route, body),
            "created_at": created_at,
        },
    )


async def _complete_112(
    conn: Any, *, user_id: str, key: str, status_code: int, response: Any, completed_at: str
) -> None:
    await conn.execute(
        COMPLETE_112_IDEMPOTENCY,
        {
            "user": user_id,
            "key": key,
            "status_code": status_code,
            "response": json.dumps(response, ensure_ascii=False),
            "completed_at": completed_at,
        },
    )


def _downloadable_112(row: Any, now: str) -> bool:
    """`isDataExportDownloadable`: done, stored and strictly unexpired."""
    if str(row["status"]) != "done":
        return False
    path = row["storage_path"]
    if path is None or path == "":
        return False
    if row["expires_at"] is None:
        return False
    return to_iso(row["expires_at"]) > now


async def spec_112(call: Call) -> dict[str, Any]:
    """`devSddSpec112Demo`: the private search, two exports, three acceptances and three keys."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        alex = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-112-alex"), first_name="Alex"
        )
        programme = await create_programme(
            conn,
            alex.id,
            modules=1,
            chapters_per_module=1,
            notions_per_chapter=2,
            title=fixture.SPEC112_PROGRAMME_TITLE,
        )
        module_id = programme.module_ids[0]
        chapter_id = programme.chapter_ids[0]
        first_notion, second_notion = programme.notion_ids[0], programme.notion_ids[1]
        await conn.execute(
            text(
                "update public.formations set description = :description where id = cast(:formation as uuid)"
            ),
            {"description": fixture.SPEC112_DESCRIPTION, "formation": programme.formation_id},
        )
        await conn.execute(
            text(
                "update public.notions set label = :label, short_definition = :definition "
                "where id = cast(:notion as uuid)"
            ),
            {
                "label": fixture.SPEC112_FIRST_NOTION_LABEL,
                "definition": fixture.SPEC112_FIRST_NOTION_DEFINITION,
                "notion": first_notion,
            },
        )
        await conn.execute(
            text(
                "update public.notions set label = :label, short_definition = :definition "
                "where id = cast(:notion as uuid)"
            ),
            {
                "label": fixture.SPEC112_SECOND_NOTION_LABEL,
                "definition": fixture.SPEC112_SECOND_NOTION_DEFINITION,
                "notion": second_notion,
            },
        )
        course = await create_course(conn, owner_id=alex.id, module_id=module_id)
        section_id = course.section_ids[0]
        await conn.execute(
            text(
                "update public.course_sections set title = :title, content_md = :content "
                "where id = cast(:section as uuid)"
            ),
            {
                "title": fixture.SPEC112_SECTION_TITLE,
                "content": fixture.SPEC112_SECTION_CONTENT,
                "section": section_id,
            },
        )

        bob = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-112-bob"), first_name="Bob"
        )
        foreign = await create_programme(
            conn,
            bob.id,
            modules=1,
            chapters_per_module=1,
            notions_per_chapter=1,
            title=fixture.SPEC112_FOREIGN_PROGRAMME_TITLE,
        )
        foreign_course = await create_course(conn, owner_id=bob.id, module_id=foreign.module_ids[0])
        await conn.execute(
            text(
                "update public.course_sections set title = :title, content_md = :content "
                "where id = cast(:section as uuid)"
            ),
            {
                "title": fixture.SPEC112_FOREIGN_SECTION_TITLE,
                "content": fixture.SPEC112_FOREIGN_SECTION_CONTENT,
                "section": foreign_course.section_ids[0],
            },
        )

        results = await as_user_rows(
            conn,
            "spec112_search",
            alex.id,
            SELECT_112_SEARCH,
            {"query": normalize_query(fixture.SPEC112_QUERY), "limit": 20},
        )
        results = results or []

        expired_id = await _create_export_112(conn, user_id=alex.id, created_at="2026-11-01T08:00:00Z")
        await _complete_export_112(
            conn,
            user_id=alex.id,
            export_id=expired_id,
            path=f"exports/{alex.id}/2026-11-01.zip",
            size=1_240_000,
            expires_at="2026-11-08T08:00:00Z",
        )
        ready_id = await _create_export_112(conn, user_id=alex.id, created_at="2026-11-11T12:00:00Z")
        await _complete_export_112(
            conn,
            user_id=alex.id,
            export_id=ready_id,
            path=f"exports/{alex.id}/2026-11-11.zip",
            size=2_480_000,
            expires_at="2026-11-18T12:00:00Z",
        )
        await _accept_112(
            conn,
            user_id=alex.id,
            document="cgu",
            version="1.2",
            accepted_at="2026-10-01T09:00:00Z",
        )
        await _accept_112(
            conn,
            user_id=alex.id,
            document="cgu",
            version="1.2",
            accepted_at="2026-10-02T09:00:00Z",
        )
        await _accept_112(
            conn,
            user_id=alex.id,
            document="cgu",
            version="1.3",
            accepted_at="2026-11-01T09:00:00Z",
        )
        await _accept_112(
            conn,
            user_id=alex.id,
            document="privacy",
            version="3.0",
            accepted_at="2026-11-01T09:05:00Z",
        )

        replay_key = "demo-export-ready-0001"
        await _reserve_112(
            conn,
            user_id=alex.id,
            key=replay_key,
            route="/api/v1/exports",
            body={"format": "zip"},
            created_at="2026-11-11T12:00:00Z",
        )
        await _complete_112(
            conn,
            user_id=alex.id,
            key=replay_key,
            status_code=202,
            response={"exportId": ready_id, "status": "queued"},
            completed_at="2026-11-11T12:00:02Z",
        )
        running_key = "demo-export-running-02"
        await _reserve_112(
            conn,
            user_id=alex.id,
            key=running_key,
            route="/api/v1/exports",
            body={"format": "zip", "includeConversations": True},
            created_at="2026-11-11T12:10:00Z",
        )
        reused_key = "demo-export-reused-003"
        await _reserve_112(
            conn,
            user_id=alex.id,
            key=reused_key,
            route="/api/v1/exports",
            body={"format": "json"},
            created_at="2026-11-11T11:55:00Z",
        )
        await _complete_112(
            conn,
            user_id=alex.id,
            key=reused_key,
            status_code=422,
            response=fixture.SPEC112_REUSED_RESPONSE,
            completed_at="2026-11-11T11:55:00.500Z",
        )

        export_rows = (await conn.execute(SELECT_112_EXPORTS, {"user": alex.id})).mappings().all()
        acceptance_rows = (await conn.execute(SELECT_112_ACCEPTANCES, {"user": alex.id})).mappings().all()
        idempotency_rows = (await conn.execute(SELECT_112_IDEMPOTENCY, {"user": alex.id})).mappings().all()
        _ = (chapter_id, fixture.SPEC112_FOREIGN_TITLE)

    groups = []
    for kind in SEARCH_KINDS:
        items = [row for row in results if str(row["kind"]) == kind]
        if items:
            groups.append(
                {
                    "kind": kind,
                    "items": [
                        {
                            "kind": str(row["kind"]),
                            "id": str(row["id"]),
                            "title": str(row["title"]),
                            "snippet": "" if row["snippet"] is None else str(row["snippet"]),
                            "href": str(row["href"]),
                            "rank": float(row["rank"]),
                        }
                        for row in items
                    ],
                }
            )
    cgu = next(
        (row for row in acceptance_rows if str(row["document"]) == "cgu"),
        None,
    )

    def state_of(key: str, status_code: int) -> str:
        if key == running_key or status_code == 0:
            return "in_progress"
        if status_code >= 400:
            return "reused"
        return "replayed"

    return {
        "query": fixture.SPEC112_QUERY,
        "groups": groups,
        "total": len(results),
        "foreignTitle": fixture.SPEC112_FOREIGN_TITLE,
        "foreignVisible": sum(
            1 for row in results if str(row["title"]) == fixture.SPEC112_FOREIGN_SECTION_TITLE
        ),
        "exports": [
            {
                "id": str(row["id"]),
                "status": str(row["status"]),
                "sizeBytes": None if row["size_bytes"] is None else int(row["size_bytes"]),
                "createdAt": to_iso(row["created_at"]),
                "expiresAt": None if row["expires_at"] is None else to_iso(row["expires_at"]),
                "downloadable": _downloadable_112(row, FIXED),
            }
            for row in export_rows
        ],
        "acceptances": [
            {
                "id": str(row["id"]),
                "document": str(row["document"]),
                "version": str(row["version"]),
                "acceptedAt": to_iso(row["accepted_at"]),
            }
            for row in acceptance_rows
        ],
        "latestCgu": None if cgu is None else str(cgu["version"]),
        "idempotency": [
            {
                "key": str(row["key"]),
                "state": state_of(str(row["key"]), int(row["status_code"])),
                "statusCode": int(row["status_code"]),
                "createdAt": to_iso(row["created_at"]),
                "completedAt": None if row["completed_at"] is None else to_iso(row["completed_at"]),
                "response": json_value(row["response"]),
            }
            for row in idempotency_rows
        ],
    }


# --- SPEC-113 -----------------------------------------------------------------------------------

SELECT_113_TABLES = text(
    """
    select c.relrowsecurity as rls, c.relforcerowsecurity as forced
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    """
)
COUNT_113_POLICIES = text(
    "select count(*)::int as count from pg_catalog.pg_policies where schemaname = 'public'"
)


READ_113: dict[tuple[str, str], Any] = {
    ("formations", "id"): text(
        "select count(*)::int as count from public.formations where id = cast(:value as uuid)"
    ),
    ("resources", "owner_id"): text(
        "select count(*)::int as count from public.resources where owner_id = cast(:value as uuid)"
    ),
    ("module_progress", "user_id"): text(
        "select count(*)::int as count from public.module_progress where user_id = cast(:value as uuid)"
    ),
    ("group_member_progress", "group_id"): text(
        "select count(*)::int as count from public.group_member_progress "
        "where group_id = cast(:value as uuid)"
    ),
    ("idempotency_keys", "user_id"): text(
        "select count(*)::int as count from public.idempotency_keys where user_id = cast(:value as uuid)"
    ),
    ("study_preferences", "user_id"): text(
        "select count(*)::int as count from public.study_preferences where user_id = cast(:value as uuid)"
    ),
}


async def _read_as_113(conn: Any, name: str, user_id: str, table: str, column: str, value: str) -> bool:
    """One RLS probe under the learner's JWT; an empty result proves the policy refused the row."""
    rows = await as_user_rows(conn, name, user_id, READ_113[(table, column)], {"value": value})
    return rows is not None and len(rows) > 0 and int(rows[0]["count"]) > 0


async def _write_chapter_as_113(conn: Any, name: str, user_id: str, chapter_id: str) -> bool:
    statement = text(
        "update public.chapters set title = title where id = cast(:chapter as uuid) returning id::text as id"
    )
    rows = await as_user_rows(conn, name, user_id, statement, {"chapter": chapter_id})
    return bool(rows)


async def spec_113(call: Call) -> dict[str, Any]:
    """`devSddSpec113Demo`: the policy catalogue and the matrix measured with three JWTs."""
    require_dev(call.deps)
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        alice = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-113-alice"), first_name="Alice"
        )
        bob = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-113-bob"), first_name="Bob"
        )
        carol = await create_user(
            conn, email=demo_email(call.deps.clock.now(), "spec-113-carol"), first_name="Carol"
        )
        programme = await create_programme(
            conn,
            alice.id,
            modules=2,
            chapters_per_module=1,
            notions_per_chapter=1,
            title=fixture.SPEC113_PROGRAMME_TITLE,
        )
        module_id, chapter_id = programme.module_ids[0], programme.chapter_ids[0]
        group_id = await create_group(
            conn,
            formation_id=programme.formation_id,
            owner_id=alice.id,
            invite_code=fixture.SPEC113_INVITE_CODE,
        )
        await join_group(conn, group_id, bob.id, joined_at=FIXED)
        await conn.execute(
            INSERT_111_MODULE_PROGRESS,
            {"user": alice.id, "module": module_id, "status": "open", "validated_at": None},
        )
        await conn.execute(
            text(
                """
                insert into public.resources (owner_id, formation_id, chapter_id, kind, title,
                                              content_text)
                values (cast(:owner as uuid), cast(:formation as uuid), cast(:chapter as uuid),
                        'note', :title, :content)
                """
            ),
            {
                "owner": alice.id,
                "formation": programme.formation_id,
                "chapter": chapter_id,
                "title": fixture.SPEC113_PRIVATE_RESOURCE_TITLE,
                "content": fixture.SPEC113_PRIVATE_RESOURCE_CONTENT,
            },
        )
        await conn.execute(
            text(
                "insert into public.idempotency_keys (user_id, key, route, request_hash) "
                "values (cast(:user as uuid), 'demo-rls-0001', '/api/v1/rls', :hash)"
            ),
            {"user": alice.id, "hash": "a" * 64},
        )

        table_rows = (await conn.execute(SELECT_113_TABLES)).mappings().all()
        policy_row = (await conn.execute(COUNT_113_POLICIES)).mappings().first()

        matrix = [
            {
                "key": "programme-read",
                "category": "shared-programme",
                "cells": {
                    "a": await _read_as_113(
                        conn,
                        "s113_prog_a",
                        alice.id,
                        "formations",
                        "id",
                        programme.formation_id,
                    ),
                    "b": await _read_as_113(
                        conn,
                        "s113_prog_b",
                        bob.id,
                        "formations",
                        "id",
                        programme.formation_id,
                    ),
                    "c": await _read_as_113(
                        conn,
                        "s113_prog_c",
                        carol.id,
                        "formations",
                        "id",
                        programme.formation_id,
                    ),
                },
            },
            {
                "key": "programme-write",
                "category": "shared-programme",
                "cells": {
                    "a": await _write_chapter_as_113(conn, "s113_write_a", alice.id, chapter_id),
                    "b": await _write_chapter_as_113(conn, "s113_write_b", bob.id, chapter_id),
                    "c": await _write_chapter_as_113(conn, "s113_write_c", carol.id, chapter_id),
                },
            },
            {
                "key": "resources-read",
                "category": "personal",
                "cells": {
                    "a": await _read_as_113(conn, "s113_res_a", alice.id, "resources", "owner_id", alice.id),
                    "b": await _read_as_113(conn, "s113_res_b", bob.id, "resources", "owner_id", alice.id),
                    "c": await _read_as_113(conn, "s113_res_c", carol.id, "resources", "owner_id", alice.id),
                },
            },
            {
                "key": "progress-read",
                "category": "personal",
                "cells": {
                    "a": await _read_as_113(
                        conn, "s113_prog2_a", alice.id, "module_progress", "user_id", alice.id
                    ),
                    "b": await _read_as_113(
                        conn, "s113_prog2_b", bob.id, "module_progress", "user_id", alice.id
                    ),
                    "c": await _read_as_113(
                        conn, "s113_prog2_c", carol.id, "module_progress", "user_id", alice.id
                    ),
                },
            },
            {
                "key": "projection-read",
                "category": "shared-programme",
                "cells": {
                    "a": await _read_as_113(
                        conn, "s113_view_a", alice.id, "group_member_progress", "group_id", group_id
                    ),
                    "b": await _read_as_113(
                        conn, "s113_view_b", bob.id, "group_member_progress", "group_id", group_id
                    ),
                    "c": await _read_as_113(
                        conn, "s113_view_c", carol.id, "group_member_progress", "group_id", group_id
                    ),
                },
            },
            {
                "key": "service-read",
                "category": "service",
                "cells": {
                    "a": await _read_as_113(
                        conn, "s113_idem_a", alice.id, "idempotency_keys", "user_id", alice.id
                    ),
                    "b": await _read_as_113(
                        conn, "s113_idem_b", bob.id, "idempotency_keys", "user_id", alice.id
                    ),
                    "c": await _read_as_113(
                        conn, "s113_idem_c", carol.id, "idempotency_keys", "user_id", alice.id
                    ),
                },
            },
            {
                "key": "settings-read",
                "category": "personal",
                "cells": {
                    "a": await _read_as_113(
                        conn, "s113_set_a", alice.id, "study_preferences", "user_id", alice.id
                    ),
                    "b": await _read_as_113(
                        conn, "s113_set_b", bob.id, "study_preferences", "user_id", alice.id
                    ),
                    "c": await _read_as_113(
                        conn, "s113_set_c", carol.id, "study_preferences", "user_id", alice.id
                    ),
                },
            },
        ]

    return {
        "tableCount": len(table_rows),
        "rlsCount": sum(1 for row in table_rows if row["rls"] is True),
        "forcedCount": sum(1 for row in table_rows if row["forced"] is True),
        "policyCount": 0 if policy_row is None else int(policy_row["count"]),
        "categories": [
            {"category": category, "count": count} for category, count in fixture.SPEC113_CATEGORIES
        ],
        "matrix": matrix,
    }


# --- SPEC-115 -----------------------------------------------------------------------------------

DEMO_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "learny-demo")


def demo_id(*parts: str) -> str:
    """`demoId`: the stable UUID v5 of one entity of the demonstration dataset."""
    return str(uuid.uuid5(DEMO_NAMESPACE, ":".join(parts)))


def demo_user_id(key: str) -> str:
    return demo_id("user", key)


def demo_formation_id(key: str) -> str:
    return demo_id("formation", key)


SELECT_115_PROFILE = text(
    "select first_name, last_name, email, timezone, streak_days from public.profiles "
    "where id = cast(:user as uuid)"
)
SELECT_115_FORMATIONS = text(
    "select id::text as id, title, status::text as status from public.formations "
    "where owner_id = cast(:user as uuid)"
)
SELECT_115_SAP = text(
    """
    select
      (select count(*)::int from public.modules where formation_id = cast(:sap as uuid)) as modules,
      (select count(*)::int from public.chapters where formation_id = cast(:sap as uuid)) as chapters,
      (select count(*)::int from public.notions where formation_id = cast(:sap as uuid)) as notions
    """
)
COUNT_115_MEMBERS = text(
    "select count(*)::int as count from public.group_members "
    "where group_id = cast(:group as uuid) and left_at is null"
)
SELECT_115_MEMBERS = text(
    """
    select p.first_name
    from public.group_members m
    join public.profiles p on p.id = m.user_id
    where m.group_id = cast(:group as uuid) and m.left_at is null
    order by m.role desc, m.joined_at
    """
)
SELECT_115_SLOTS = text(
    """
    select
      s.id::text as id,
      to_char(s.starts_at at time zone 'Europe/Paris', 'HH24:MI') as start,
      to_char(s.ends_at at time zone 'Europe/Paris', 'HH24:MI') as end,
      s.title, s.meta, s.status::text as status, f.title as formation,
      to_char((s.starts_at at time zone 'Europe/Paris')::date, 'YYYY-MM-DD') as day
    from public.schedule_slots s
    join public.formations f on f.id = s.formation_id
    where s.user_id = cast(:user as uuid)
      and s.formation_id in (cast(:sap as uuid), cast(:agile as uuid))
      and (s.starts_at at time zone 'Europe/Paris')::date
          between date '2026-11-09' and date '2026-11-13'
    order by s.starts_at
    """
)
COUNT_115_UNREAD = text(
    "select count(*)::int as count from public.notifications "
    "where user_id = cast(:user as uuid) and read_at is null"
)


def _check_115(key: str, expected: int, observed: int, source: dict[str, str]) -> dict[str, Any]:
    return {
        "key": key,
        "label": fixture.SPEC115_CHECK_LABELS[key],
        "expected": str(expected),
        "observed": str(observed),
        "ok": expected == observed,
        "source": source,
    }


def _empty_115() -> dict[str, Any]:
    return {
        "present": False,
        "profile": None,
        "formations": {"activeOrProposed": 0, "completed": 0, "titles": []},
        "sap": {"modules": 0, "chapters": 0, "notions": 0},
        "group": {"members": 0, "names": []},
        "agenda": {"days": [], "slots": 0, "unread": 0},
        "checks": [],
    }


async def spec_115(call: Call) -> dict[str, Any]:
    """`devSddSpec115Demo`: the demonstration dataset measured on the seeded database."""
    require_dev(call.deps)
    alex_id = demo_user_id("alex")
    sap_id = demo_formation_id("sap")
    agile_id = demo_formation_id("agile")
    group_id = demo_id("group", "agile")
    async with rolled_back(call.deps) as tx:
        conn = tx.conn
        profile = (await conn.execute(SELECT_115_PROFILE, {"user": alex_id})).mappings().first()
        if profile is None:
            return _empty_115()
        formation_rows = (await conn.execute(SELECT_115_FORMATIONS, {"user": alex_id})).mappings().all()
        display_order = {
            title: index for index, (title, _status, _progress) in enumerate(fixture.SPEC115_FORMATIONS)
        }
        formations = sorted(formation_rows, key=lambda row: display_order.get(str(row["title"]), 99))
        active = sum(1 for row in formations if str(row["status"]) in ("active", "programme_proposed"))
        completed = sum(1 for row in formations if str(row["status"]) == "completed")
        sap_row = (await conn.execute(SELECT_115_SAP, {"sap": sap_id})).mappings().first()
        sap = (
            {"modules": 0, "chapters": 0, "notions": 0}
            if sap_row is None
            else {
                "modules": int(sap_row["modules"]),
                "chapters": int(sap_row["chapters"]),
                "notions": int(sap_row["notions"]),
            }
        )
        member_count = (await conn.execute(COUNT_115_MEMBERS, {"group": group_id})).mappings().first()
        member_rows = (await conn.execute(SELECT_115_MEMBERS, {"group": group_id})).mappings().all()
        slot_rows = (
            (
                await conn.execute(
                    SELECT_115_SLOTS,
                    {"user": alex_id, "sap": sap_id, "agile": agile_id},
                )
            )
            .mappings()
            .all()
        )
        unread_row = (await conn.execute(COUNT_115_UNREAD, {"user": alex_id})).mappings().first()

    members = 0 if member_count is None else int(member_count["count"])
    unread = 0 if unread_row is None else int(unread_row["count"])
    days = [
        {
            "date": day["date"],
            "label": day["label"],
            "slots": [
                {
                    "id": str(row["id"]),
                    "start": str(row["start"]),
                    "end": str(row["end"]),
                    "title": str(row["title"]),
                    "meta": None if row["meta"] is None else str(row["meta"]),
                    "status": str(row["status"]),
                    "formation": str(row["formation"]),
                }
                for row in slot_rows
                if str(row["day"]) == day["date"]
            ],
        }
        for day in fixture.SPEC115_AGENDA_DAYS
    ]
    progress_by_title = {title: progress for title, _status, progress in fixture.SPEC115_FORMATIONS}
    return {
        "present": True,
        "profile": {
            "fullName": f"{profile['first_name'] or ''} {profile['last_name'] or ''}".strip(),
            "email": str(profile["email"]),
            "timezone": str(profile["timezone"]),
            "streakDays": int(profile["streak_days"]),
        },
        "formations": {
            "activeOrProposed": active,
            "completed": completed,
            "titles": [
                {
                    "title": str(row["title"]),
                    "status": str(row["status"]),
                    "progress": progress_by_title.get(str(row["title"])),
                }
                for row in formations
            ],
        },
        "sap": sap,
        "group": {
            "members": members,
            "names": [
                fixture.SPEC115_MISSING_FIRST_NAME if row["first_name"] is None else str(row["first_name"])
                for row in member_rows
            ],
        },
        "agenda": {"days": days, "slots": len(slot_rows), "unread": unread},
        "checks": [
            _check_115(
                "sap.modules",
                fixture.SPEC115_EXPECTED_SAP_MODULES,
                sap["modules"],
                {"screen": "SCR-05", "file": "Programme.dc.html", "element": "Modules et chapitres"},
            ),
            _check_115(
                "sap.notions",
                fixture.SPEC115_EXPECTED_SAP_NOTIONS,
                sap["notions"],
                {"screen": "SCR-14", "file": "Carte.dc.html", "element": "const N"},
            ),
            _check_115(
                "formations.active_or_proposed",
                fixture.SPEC115_EXPECTED_ACTIVE,
                active,
                fixture.SPEC115_FORMATION_SOURCE,
            ),
            _check_115(
                "formations.completed",
                fixture.SPEC115_EXPECTED_COMPLETED,
                completed,
                fixture.SPEC115_FORMATION_SOURCE,
            ),
            _check_115(
                "group.members",
                fixture.SPEC115_EXPECTED_GROUP_MEMBERS,
                members,
                {"screen": "fixture", "file": "Main.dc.html", "element": "membres du groupe agile"},
            ),
            _check_115(
                "agenda.slots",
                fixture.SPEC115_EXPECTED_AGENDA_SLOTS,
                len(slot_rows),
                {"screen": "SCR-12", "file": "Agenda.dc.html", "element": "const week2"},
            ),
            _check_115(
                "agenda.days",
                fixture.SPEC115_EXPECTED_AGENDA_DAYS,
                len({str(row["day"]) for row in slot_rows}),
                {
                    "screen": "SCR-12",
                    "file": "Agenda.dc.html",
                    "element": "semaine du 9 au 13 novembre",
                },
            ),
            _check_115(
                "notifications.unread",
                fixture.SPEC115_EXPECTED_UNREAD,
                unread,
                fixture.SPEC115_NOTIFICATION_SOURCE,
            ),
        ],
    }
