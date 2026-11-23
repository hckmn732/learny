"""[SPEC-2203] Reading progress: monotone write, single event and stored timestamp under RLS.

Ported from `packages/services/src/courses/progress.service.test.ts` (SPEC-609 EF-3, ET-5,
BR-COU-08): the same chapter, section and timestamp fixtures, read on the local stack. The
unauthenticated case of the TypeScript file is enforced by the facade (`requireUser`), covered by
the pipeline tests, so it has no use-case equivalent here.
"""

from typing import Any

import pytest
from factories.course_support import (
    content_deps,
    create_course,
    create_progress,
    create_section,
    event_row,
    seed_learner,
)
from factories.db_support import rolled_back
from factories.identity_support import FIXED, actor_for, create_chapter, create_user
from learny.content.application import progress as progress_service
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.time import to_iso
from learny_api.generated.models import CoursesProgressOutput

pytestmark = pytest.mark.spec("SPEC-2203")

NOW_ISO = to_iso(FIXED)


async def record(tx: Tx, user_id: str, course_id: str, chapter_id: str, visible: list[str]) -> Any:
    return await progress_service.record_course_progress(
        content_deps(tx),
        actor_for(user_id),
        course_id,
        {"chapterId": chapter_id, "visibleSectionIds": visible},
    )


async def test_an_invalid_course_identifier_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        return await record(tx, alice["user"], "pas-un-uuid", alice["chapter"], [])

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"


async def test_an_invalid_chapter_or_section_identifier_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
        )
        bad_chapter = await record(tx, alice["user"], course_id, "pas-un-uuid", [])
        bad_section = await record(tx, alice["user"], course_id, alice["chapter"], ["pas-un-uuid"])
        return bad_chapter, bad_section

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"


async def test_a_missing_or_foreign_course_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
        )
        bob = await create_user(tx.conn, "Bob")
        return await record(tx, bob, course_id, alice["chapter"], [])

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.COURSE_NOT_FOUND


async def test_a_chapter_outside_the_module_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1, modules=2)
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
        )
        other_chapter = await create_chapter(tx.conn, alice["formation"], alice["modules"][1], 1)
        return await record(tx, alice["user"], course_id, other_chapter, [])

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.CHAPTER_NOT_FOUND


async def test_the_progress_is_recorded_at_once_with_a_single_event(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
        )
        first = await create_section(
            tx,
            course_id=course_id,
            owner_id=alice["user"],
            chapter_id=alice["chapter"],
            position=1,
            anchor="section-1",
        )
        second = await create_section(
            tx,
            course_id=course_id,
            owner_id=alice["user"],
            chapter_id=alice["chapter"],
            position=2,
            anchor="section-2",
        )
        result = await record(tx, alice["user"], course_id, alice["chapter"], [first, second])
        events = await event_row(tx, f"course-progress:{course_id}:{alice['chapter']}:100")
        return result, events, alice["user"], course_id, alice["chapter"]

    result, events, user_id, course_id, chapter_id = await rolled_back(database, run)
    assert CoursesProgressOutput.model_validate(result).chapterPercent == 100
    assert result == {"chapterPercent": 100, "coursePercent": 100, "updatedAt": NOW_ISO}
    assert len(events) == 1
    assert events[0]["name"] == "course/progress-updated"
    assert events[0]["data"] == {
        "userId": user_id,
        "courseId": course_id,
        "chapterId": chapter_id,
        "percent": 100,
    }


async def test_the_progress_never_goes_backwards_and_keeps_the_stored_timestamp(
    database: Database,
) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
        )
        first = await create_section(
            tx,
            course_id=course_id,
            owner_id=alice["user"],
            chapter_id=alice["chapter"],
            position=1,
            anchor="section-1",
        )
        await create_section(
            tx,
            course_id=course_id,
            owner_id=alice["user"],
            chapter_id=alice["chapter"],
            position=2,
            anchor="section-2",
        )
        await create_progress(
            tx, user_id=alice["user"], course_id=course_id, chapter_id=alice["chapter"], percent=80
        )
        result = await record(tx, alice["user"], course_id, alice["chapter"], [first])
        events = await event_row(tx, f"course-progress:{course_id}:{alice['chapter']}")
        return result, events

    result, events = await rolled_back(database, run)
    assert result == {"chapterPercent": 80, "coursePercent": 80, "updatedAt": NOW_ISO}
    assert events == []


async def test_unknown_sections_are_ignored_and_an_empty_chapter_stores_no_timestamp(
    database: Database,
) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
        )
        return await record(tx, alice["user"], course_id, alice["chapter"], [])

    result = await rolled_back(database, run)
    assert result == {"chapterPercent": 0, "coursePercent": 0, "updatedAt": None}


async def test_the_persisted_percentages_are_read_by_chapter(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
        )
        await create_progress(
            tx, user_id=alice["user"], course_id=course_id, chapter_id=alice["chapter"], percent=60
        )
        return await progress_service.read_progress_by_chapter(tx, alice["user"], course_id), alice["chapter"]

    found, chapter_id = await rolled_back(database, run)
    assert found == {chapter_id: 60}
