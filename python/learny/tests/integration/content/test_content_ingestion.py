"""[SPEC-2203] Ingestion of a contribution: five stages, resumability and domain events.

A note becomes `ready` with located passages and one `resource/ready` event, a duplicate delivery
does nothing, a permanent failure ends in `failed` with `resource/failed`, and a transient embedding
outage leaves the resource `processing` for the retry.
"""

from dataclasses import dataclass
from typing import Any

import pytest
import structlog
from factories.db_support import rolled_back
from factories.identity_support import (
    FIXED,
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_user,
)
from factories.learning_deps import LearningTransactions
from learny.content.application import ingestion as ingestion_service
from learny.content.application import resources as resources_service
from learny.content.application.ingestion import IngestionPorts
from learny.content.domain.errors import IngestionError
from learny.platform.embeddings import MockEmbedder
from learny.platform.llm.gateway import MockGateway
from learny.platform.llm.mock import load_registry
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2203")


class _Storage:
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
    settings: Settings
    clock: FixedClock
    db: LearningTransactions
    storage: Any
    logger: Any
    llm: Any


def content_deps(tx: Tx) -> ContentTestDeps:
    return ContentTestDeps(
        settings=Settings(),
        clock=FixedClock(FIXED),
        db=LearningTransactions(tx),
        storage=_Storage(),
        logger=structlog.get_logger("learny.test"),
        llm=MockGateway(load_registry()),
    )


async def seed_chapter(tx: Tx, email: str) -> dict[str, str]:
    user_id = await create_user(tx.conn, email)
    formation_id = await create_formation(tx.conn, user_id)
    module_id = await create_module(tx.conn, formation_id, 1)
    chapter_id = await create_chapter(tx.conn, formation_id, module_id)
    return {"user": user_id, "formation": formation_id, "module": module_id, "chapter": chapter_id}


async def no_upload(_input: Any) -> None:
    return None


async def no_read(_input: Any) -> None:
    raise AssertionError("no private file is read by these cases")


class _BrokenEmbedder:
    async def embed(self, _texts: list[str]) -> list[list[float]]:
        raise IngestionError("EMBEDDING_UNAVAILABLE", "indisponible", permanent=False)


def ports(*, embedder: Any = None) -> IngestionPorts:
    return IngestionPorts(
        read_file=no_read,
        embedder=embedder if embedder is not None else MockEmbedder(),
        upload_pdf=no_upload,
        mode="mock",
    )


async def event_ids(tx: Tx, prefix: str) -> list[str]:
    result = await tx.conn.execute(
        text("select event_id from public.event_outbox where event_id like :prefix order by event_id"),
        {"prefix": f"{prefix}%"},
    )
    return [row[0] for row in result.all()]


async def chunk_count(tx: Tx, resource_id: str) -> int:
    result = await tx.conn.execute(
        text("select count(*)::int from public.resource_chunks where resource_id = cast(:id as uuid)"),
        {"id": resource_id},
    )
    return int(result.scalar_one())


async def resource_row(tx: Tx, resource_id: str) -> Any:
    result = await tx.conn.execute(
        text("select status, error_code, metadata, title from public.resources where id = cast(:id as uuid)"),
        {"id": resource_id},
    )
    return result.mappings().one()


async def test_a_note_becomes_ready_with_located_passages_and_one_event(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_chapter(tx, "Alice")
        deps = content_deps(tx)
        created = await resources_service.create_resource(
            deps,
            actor_for(seed["user"]),
            seed["chapter"],
            {"kind": "note", "title": "Brouillon", "text": "La photosynthese produit du glucose."},
        )
        outcome = await ingestion_service.process_resource(deps, created["id"], ports=ports())
        return (
            created,
            outcome,
            await resource_row(tx, created["id"]),
            await event_ids(tx, f"resource-ready:{created['id']}"),
        )

    created, outcome, row, events = await rolled_back(database, run)
    assert outcome["outcome"] == "ready"
    assert outcome["chunkCount"] >= 1
    assert outcome["embeddingCount"] == outcome["chunkCount"]
    assert row["status"] == "ready"
    assert row["error_code"] is None
    assert row["title"] == "Brouillon"
    assert row["metadata"]["ingestion"]["completedAt"] == "2026-11-11T12:20:00.000Z"
    assert row["metadata"]["ingestion"]["embeddingModel"] == "voyage-4-lite"
    assert row["metadata"]["ingestion"]["embeddingDim"] == 1024
    assert events == [f"resource-ready:{created['id']}"]


async def test_a_duplicate_delivery_does_nothing(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_chapter(tx, "Alice")
        deps = content_deps(tx)
        created = await resources_service.create_resource(
            deps,
            actor_for(seed["user"]),
            seed["chapter"],
            {"kind": "note", "title": "Brouillon", "text": "Une note deja traitee."},
        )
        first = await ingestion_service.process_resource(deps, created["id"], ports=ports())
        chunks_after_first = await chunk_count(tx, created["id"])
        second = await ingestion_service.process_resource(deps, created["id"], ports=ports())
        return (
            first,
            second,
            chunks_after_first,
            await chunk_count(tx, created["id"]),
            await event_ids(tx, f"resource-ready:{created['id']}"),
        )

    first, second, chunks_after_first, chunks_after_second, events = await rolled_back(database, run)
    assert first["outcome"] == "ready"
    assert second["outcome"] == "ready"
    assert second["chunkCount"] == first["chunkCount"]
    assert chunks_after_first == chunks_after_second
    assert events == [f"resource-ready:{first['resourceId']}"]


async def test_a_permanent_failure_ends_in_failed_with_one_event(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_chapter(tx, "Alice")
        deps = content_deps(tx)
        created = await resources_service.create_resource(
            deps,
            actor_for(seed["user"]),
            seed["chapter"],
            {"kind": "note", "title": "Vide", "text": "   "},
        )
        outcome = await ingestion_service.process_resource(deps, created["id"], ports=ports())
        return (
            created,
            outcome,
            await resource_row(tx, created["id"]),
            await event_ids(tx, f"resource-failed:{created['id']}"),
        )

    created, outcome, row, events = await rolled_back(database, run)
    assert outcome["outcome"] == "failed"
    assert outcome["errorCode"] == "NOTE_EMPTY"
    assert row["status"] == "failed"
    assert row["error_code"] == "NOTE_EMPTY"
    assert events == [f"resource-failed:{created['id']}"]


async def test_a_transient_embedding_outage_keeps_the_resource_processing(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_chapter(tx, "Alice")
        deps = content_deps(tx)
        created = await resources_service.create_resource(
            deps,
            actor_for(seed["user"]),
            seed["chapter"],
            {"kind": "note", "title": "Reprise", "text": "Une note reprise apres une panne."},
        )
        with pytest.raises(IngestionError):
            await ingestion_service.process_resource(
                deps, created["id"], ports=ports(embedder=_BrokenEmbedder())
            )
        processing = await resource_row(tx, created["id"])
        outcome = await ingestion_service.process_resource(deps, created["id"], ports=ports())
        attempts = (await resource_row(tx, created["id"]))["metadata"]["ingestion"]["attempts"]
        return created, processing, outcome, attempts

    _, processing, outcome, attempts = await rolled_back(database, run)
    assert processing["status"] == "processing"
    assert outcome["outcome"] == "ready"
    assert attempts == 2


async def test_an_unknown_identifier_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        deps = content_deps(tx)
        with pytest.raises(AppError) as error:
            await ingestion_service.process_resource(deps, "not-a-uuid", ports=ports())
        return error.value

    error = await rolled_back(database, run)
    assert getattr(error, "code", None) == "VALIDATION_FAILED"
