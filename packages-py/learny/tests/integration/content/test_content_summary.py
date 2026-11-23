"""[SPEC-2203] Chapter summary: commit before the model call, replay and deferred draft."""

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
from learny.content.application import summary as summary_service
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


class CountingGateway:
    """Wraps the deterministic mock so a replay can prove the tutor was not called again."""

    def __init__(self) -> None:
        self.calls = 0
        self._inner = MockGateway(load_registry())

    async def object(self, *args: Any, **kwargs: Any) -> Any:
        self.calls += 1
        return await self._inner.object(*args, **kwargs)


class UnavailableGateway:
    async def object(self, *args: Any, **kwargs: Any) -> Any:
        raise AppError("AI_UNAVAILABLE", "indisponible")


@dataclass
class ContentTestDeps:
    settings: Settings
    clock: FixedClock
    db: LearningTransactions
    storage: Any
    logger: Any
    llm: Any


def content_deps(tx: Tx, *, llm: Any = None) -> ContentTestDeps:
    return ContentTestDeps(
        settings=Settings(),
        clock=FixedClock(FIXED),
        db=LearningTransactions(tx),
        storage=_Storage(),
        logger=structlog.get_logger("learny.test"),
        llm=llm if llm is not None else MockGateway(load_registry()),
    )


async def seed_course(tx: Tx) -> dict[str, str]:
    user_id = await create_user(tx.conn, "Alice")
    formation_id = await create_formation(tx.conn, user_id)
    module_id = await create_module(tx.conn, formation_id, 1)
    chapter_id = await create_chapter(tx.conn, formation_id, module_id)
    result = await tx.conn.execute(
        text(
            "insert into public.courses "
            "(owner_id, formation_id, module_id, version, is_current, status) "
            "values (cast(:owner as uuid), cast(:formation as uuid), cast(:module as uuid), "
            "1, true, 'ready') returning id::text as id"
        ),
        {"owner": user_id, "formation": formation_id, "module": module_id},
    )
    course_id = str(result.scalar_one())
    await tx.conn.execute(
        text(
            "insert into public.course_sections "
            "(course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, data, origin) "
            "values (cast(:course as uuid), cast(:owner as uuid), cast(:chapter as uuid), 1, "
            "'retain', 'a-retenir', 'A retenir', 'Le compte 512 enregistre la banque.', "
            "cast(:data as jsonb), 'tutor')"
        ),
        {
            "course": course_id,
            "owner": user_id,
            "chapter": chapter_id,
            "data": (
                '{"points": ["Le compte 512 enregistre la banque.", "Une piece\u0020est\u0020equilibree."]}'
            ),
        },
    )
    return {
        "user": user_id,
        "formation": formation_id,
        "module": module_id,
        "chapter": chapter_id,
        "course": course_id,
    }


async def event_ids(tx: Tx, prefix: str) -> list[str]:
    result = await tx.conn.execute(
        text("select event_id from public.event_outbox where event_id like :prefix order by event_id"),
        {"prefix": f"{prefix}%"},
    )
    return [row[0] for row in result.all()]


async def summary_row(tx: Tx, summary_id: str) -> Any:
    result = await tx.conn.execute(
        text(
            "select text, feedback, course_id::text as course_id, chapter_id::text as chapter_id "
            "from public.chapter_summaries where id = cast(:id as uuid)"
        ),
        {"id": summary_id},
    )
    return result.mappings().one()


async def test_the_summary_is_committed_corrected_and_emitted_once(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_course(tx)
        gateway = CountingGateway()
        view = await summary_service.submit_chapter_summary(
            content_deps(tx, llm=gateway),
            actor_for(seed["user"]),
            seed["chapter"],
            {"courseId": seed["course"], "text": "Une piece a un en-tete."},
            "summary-key-0001",
        )
        return (
            seed,
            view,
            gateway.calls,
            await summary_row(tx, view["id"]),
            await event_ids(tx, f"course-summary:{view['id']}"),
        )

    seed, view, calls, row, events = await rolled_back(database, run)
    assert view["status"] == "corrected"
    assert view["feedback"] is not None
    assert view["feedback"]["verdict"] in ("good", "partial", "insufficient")
    assert view["chapterId"] == seed["chapter"]
    assert view["courseId"] == seed["course"]
    assert view["createdAt"] == "2026-11-11T12:20:00.000Z"
    assert calls == 1
    assert row["text"] == "Une piece a un en-tete."
    assert row["feedback"]["verdict"] == view["feedback"]["verdict"]
    assert events == [f"course-summary:{view['id']}"]


async def test_a_replay_returns_the_first_summary_without_a_second_call_or_event(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_course(tx)
        gateway = CountingGateway()
        first = await summary_service.submit_chapter_summary(
            content_deps(tx, llm=gateway),
            actor_for(seed["user"]),
            seed["chapter"],
            {"courseId": seed["course"], "text": "Une piece a un en-tete."},
            "summary-key-0001",
        )
        second = await summary_service.submit_chapter_summary(
            content_deps(tx, llm=gateway),
            actor_for(seed["user"]),
            seed["chapter"],
            {"courseId": seed["course"], "text": "Un autre texte rejoue."},
            "summary-key-0001",
        )
        return first, second, gateway.calls, await event_ids(tx, f"course-summary:{first['id']}")

    first, second, calls, events = await rolled_back(database, run)
    assert second["id"] == first["id"]
    assert second["text"] == first["text"]
    assert calls == 1
    assert events == [f"course-summary:{first['id']}"]


async def test_an_unavailable_tutor_keeps_the_text_as_a_draft(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_course(tx)
        view = await summary_service.submit_chapter_summary(
            content_deps(tx, llm=UnavailableGateway()),
            actor_for(seed["user"]),
            seed["chapter"],
            {"courseId": seed["course"], "text": "Une piece a un en-tete."},
            None,
        )
        return view, await summary_row(tx, view["id"]), await event_ids(tx, f"course-summary:{view['id']}")

    view, row, events = await rolled_back(database, run)
    assert view["status"] == "deferred"
    assert view["feedback"] is None
    assert row["text"] == "Une piece a un en-tete."
    assert row["feedback"] is None
    assert events == [f"course-summary:{view['id']}"]


async def test_the_identifier_text_and_request_key_are_validated(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_course(tx)
        deps = content_deps(tx)
        codes = []
        for chapter_id, body, key in (
            ("not-a-uuid", {"courseId": seed["course"], "text": "x"}, None),
            (seed["chapter"], {"courseId": seed["course"], "text": "   "}, None),
            (seed["chapter"], {"courseId": "not-a-uuid", "text": "x"}, None),
            (seed["chapter"], {"courseId": seed["course"], "text": "x"}, "court"),
        ):
            with pytest.raises(AppError) as error:
                await summary_service.submit_chapter_summary(
                    deps, actor_for(seed["user"]), chapter_id, body, key
                )
            codes.append(error.value.code)
        return codes

    assert await rolled_back(database, run) == ["VALIDATION_FAILED"] * 4


async def test_a_course_that_is_not_ready_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seed = await seed_course(tx)
        await tx.conn.execute(
            text("update public.courses set status = 'generating' where id = cast(:id as uuid)"),
            {"id": seed["course"]},
        )
        with pytest.raises(AppError) as error:
            await summary_service.submit_chapter_summary(
                content_deps(tx),
                actor_for(seed["user"]),
                seed["chapter"],
                {"courseId": seed["course"], "text": "Une piece a un en-tete."},
                None,
            )
        return error.value.code

    assert await rolled_back(database, run) == "NOT_FOUND"
