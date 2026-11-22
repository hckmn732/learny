"""[SPEC-2203] Contributions, module screen and chapter completion under RLS.

Ported from `packages/services/src/resources/{create,retry,module,complete-chapter}.test.ts` and
`test/integration/resource.test.ts`: a note is created queued with one `resource/uploaded` event, a
failed contribution is retried once, the module screen selects the first open chapter and hides
another learner's module, and completing the last chapter requests one generation.
"""

from dataclasses import dataclass
from datetime import datetime
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
from learny.content.application import chapters as chapters_service
from learny.content.application import module_screen as module_service
from learny.content.application import resources as resources_service
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny_api.generated.models import (
    ChaptersCompleteOutput,
    ModulesScreenOutput,
    ResourcesCreateOutput,
    ResourcesRetryOutput,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2203")


class _Storage:
    """The storage gateway is never reached by these cases."""

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


def content_deps(tx: Tx, *, now: datetime = FIXED) -> ContentTestDeps:
    """Builds the stand-in bundle around an already open seed transaction."""
    return ContentTestDeps(
        settings=Settings(),
        clock=FixedClock(now),
        db=LearningTransactions(tx),
        storage=_Storage(),
        logger=structlog.get_logger("learny.test"),
    )


async def event_ids(tx: Tx, prefix: str) -> list[str]:
    """The outbox events whose identifier starts with `prefix`."""
    result = await tx.conn.execute(
        text("select event_id from public.event_outbox where event_id like :prefix order by event_id"),
        {"prefix": f"{prefix}%"},
    )
    return [row[0] for row in result.all()]


async def mark_failed(tx: Tx, resource_id: str) -> None:
    """A permanently failed contribution, as the ingestion leaves it (BR-APP-07)."""
    await tx.conn.execute(
        text(
            """
            update public.resources
               set status = 'failed', error_code = 'RESOURCE_UNSUPPORTED',
                   error_message = 'Type non pris en charge.'
             where id = cast(:id as uuid)
            """
        ),
        {"id": resource_id},
    )


async def seed_chapter(tx: Tx, email: str) -> dict[str, str]:
    """A learner with one formation, module and chapter."""
    user_id = await create_user(tx.conn, email)
    formation_id = await create_formation(tx.conn, user_id)
    module_id = await create_module(tx.conn, formation_id, 1)
    chapter_id = await create_chapter(tx.conn, formation_id, module_id)
    await tx.conn.execute(
        text(
            """
            update public.formations
               set start_date = date '2026-11-02', end_date = date '2026-12-20'
             where id = cast(:id as uuid)
            """
        ),
        {"id": formation_id},
    )
    return {"user": user_id, "formation": formation_id, "module": module_id, "chapter": chapter_id}


async def test_a_note_is_created_queued_with_one_event(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_chapter(tx, "Alice")
        created = await resources_service.create_resource(
            content_deps(tx),
            actor_for(seed["user"]),
            seed["chapter"],
            {"kind": "note", "title": "Brouillon", "text": "La photosynthese."},
        )
        resources = await tx.conn.execute(
            text(
                "select status, title, kind::text as kind from public.resources where id = cast(:id as uuid)"
            ),
            {"id": created["id"]},
        )
        events = await event_ids(tx, f"resource-uploaded:{created['id']}")
        return created, resources.one(), events

    created, row, events = await rolled_back(database, run)
    assert ResourcesCreateOutput.model_validate(created).status == "queued"
    assert row is not None
    assert row[0] == "queued"
    assert row[1] == "Brouillon"
    assert row[2] == "note"
    assert events == [f"resource-uploaded:{created['id']}"]


async def test_an_oversized_note_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_chapter(tx, "Alice")
        return await resources_service.create_resource(
            content_deps(tx),
            actor_for(seed["user"]),
            seed["chapter"],
            {"kind": "note", "title": "Trop long", "text": "a" * 100_001},
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "UPLOAD_TOO_LARGE"


async def test_a_failed_contribution_is_retried_once(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_chapter(tx, "Alice")
        created = await resources_service.create_resource(
            content_deps(tx),
            actor_for(seed["user"]),
            seed["chapter"],
            {"kind": "web", "url": "https://example.test/article", "title": "Article"},
        )
        await mark_failed(tx, created["id"])
        first = await resources_service.retry_resource(
            content_deps(tx), actor_for(seed["user"]), created["id"]
        )
        second = await resources_service.retry_resource(
            content_deps(tx), actor_for(seed["user"]), created["id"]
        )
        events = await event_ids(tx, f"resource-uploaded:{created['id']}:retry")
        return first, second, events

    first, second, events = await rolled_back(database, run)
    assert ResourcesRetryOutput.model_validate(first).status == "queued"
    assert ResourcesRetryOutput.model_validate(second).status == "queued"
    assert events == [f"resource-uploaded:{first['id']}:retry-1"]


async def test_the_module_screen_selects_the_first_open_chapter(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_chapter(tx, "Alice")
        await resources_service.create_resource(
            content_deps(tx),
            actor_for(seed["user"]),
            seed["chapter"],
            {"kind": "note", "title": "Note", "text": "Contenu utile."},
        )
        return await module_service.get_module_screen(
            content_deps(tx), actor_for(seed["user"]), seed["module"], None
        )

    screen = await rolled_back(database, run)
    parsed = ModulesScreenOutput.model_validate(screen)
    assert parsed.selectedChapterId is not None
    assert parsed.counts.chapterResources == 1
    assert [chapter["id"] for chapter in screen["chapters"]] == [parsed.selectedChapterId]


async def test_another_learners_module_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_chapter(tx, "Alice")
        bob = await create_user(tx.conn, "Bob")
        return await module_service.get_module_screen(content_deps(tx), actor_for(bob), alice["module"], None)

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"


async def test_completing_the_last_chapter_requests_one_generation(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_chapter(tx, "Alice")
        first = await chapters_service.complete_chapter(
            content_deps(tx), actor_for(seed["user"]), seed["chapter"], {"done": True}
        )
        replay = await chapters_service.complete_chapter(
            content_deps(tx), actor_for(seed["user"]), seed["chapter"], {"done": True}
        )
        events = await event_ids(tx, f"course-generation:{seed['module']}:auto:")
        return first, replay, events

    first, replay, events = await rolled_back(database, run)
    parsed = ChaptersCompleteOutput.model_validate(first)
    assert parsed.contributionsStatus == "done"
    assert parsed.chaptersDone == 1
    assert parsed.chaptersTotal == 1
    assert parsed.generationRequested is True
    assert ChaptersCompleteOutput.model_validate(replay).generationRequested is False
    assert len(events) == 1
