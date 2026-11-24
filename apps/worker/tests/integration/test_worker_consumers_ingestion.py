"""[SPEC-2207] Ingestion consumed by the real worker: one note becomes ready once.

`resource/uploaded` reaches `content.process_resource` through the dispatcher and the runner, with
the deterministic embedder of the test mode. A replayed event adds no passage and no second
`resource/ready`.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    create_chapter,
    create_formation,
    create_module,
    create_user,
)
from learny.shared.db.uow import Database, Tx
from sqlalchemy import text
from support.jobs import count, delivery, emit_event, event_ids, harness

pytestmark = pytest.mark.spec("SPEC-2207")

INSERT_RESOURCE = text(
    "insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text) "
    "values (cast(:user as uuid), cast(:formation as uuid), cast(:chapter as uuid), 'note', "
    ":title, :content) returning id::text as id"
)
READ_RESOURCE = text(
    "select status::text as status, error_code, title from public.resources where id = cast(:id as uuid)"
)
CHUNKS = text("select count(*)::int from public.resource_chunks where resource_id = cast(:id as uuid)")


async def seed_note(tx: Tx) -> dict[str, str]:
    user = await create_user(tx.conn, "Gaspard")
    formation = await create_formation(tx.conn, user)
    module = await create_module(tx.conn, formation, 1)
    chapter = await create_chapter(tx.conn, formation, module)
    resource = (
        await tx.conn.execute(
            INSERT_RESOURCE,
            {
                "user": user,
                "formation": formation,
                "chapter": chapter,
                "title": "Brouillon",
                "content": "La photosynthese produit du glucose et de l oxygene.",
            },
        )
    ).scalar_one()
    return {
        "user": user,
        "formation": formation,
        "module": module,
        "chapter": chapter,
        "resource": str(resource),
    }


async def test_a_uploaded_note_is_ingested_once(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        seed = await seed_note(tx)
        event_id = await emit_event(
            tx,
            "resource/uploaded",
            {
                "userId": seed["user"],
                "resourceId": seed["resource"],
                "formationId": seed["formation"],
                "chapterId": seed["chapter"],
                "kind": "note",
            },
            f"resource-uploaded:{seed['resource']}",
        )
        worker = harness(tx, ("content.process_resource",))

        first = await worker.drain()
        row = dict((await tx.conn.execute(READ_RESOURCE, {"id": seed["resource"]})).mappings().one())
        chunks = await count(tx, str(CHUNKS.text), id=seed["resource"])
        state = await delivery(tx, event_id, "content.process_resource")
        events = await event_ids(tx, f"resource-ready:{seed['resource']}")

        second = await worker.drain()
        chunks_after = await count(tx, str(CHUNKS.text), id=seed["resource"])
        events_after = await event_ids(tx, f"resource-ready:{seed['resource']}")
        return {
            "first": first,
            "row": row,
            "chunks": chunks,
            "state": state,
            "events": events,
            "second": second,
            "chunks_after": chunks_after,
            "events_after": events_after,
        }

    result = await rolled_back(database, run)

    assert result["first"][1] == 1
    assert result["row"]["status"] == "ready"
    assert result["row"]["error_code"] is None
    assert result["chunks"] >= 1
    assert result["state"] is not None
    assert result["state"]["status"] == "done"
    assert result["events"] == [result["events"][0]]
    assert result["second"][1] == 0
    assert result["chunks_after"] == result["chunks"]
    assert result["events_after"] == result["events"]
