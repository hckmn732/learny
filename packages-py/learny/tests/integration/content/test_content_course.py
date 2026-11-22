"""[SPEC-2203] Course read model: empty generation states, typed sections and their citations.

Ported from `packages/services/src/courses/get-course.test.ts` and `get-course-detail.test.ts`
(SPEC-608 EF-1 to EF-5, SPEC-609 BR-COU-02/07/08/11): the same module, chapter, course, section,
citation, suggestion, summary and progress fixtures as the TypeScript fakes, read under RLS on the
local stack.
"""

from typing import Any

import pytest
from factories.course_support import (
    content_deps,
    create_chunk,
    create_citation,
    create_course,
    create_progress,
    create_resource,
    create_section,
    create_summary,
    seed_learner,
)
from factories.db_support import rolled_back
from factories.identity_support import actor_for, create_notion, create_user
from learny.content.application import course as course_service
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny_api.generated.models import ModulesCourseOutput

pytestmark = pytest.mark.spec("SPEC-2203")


async def read_course(tx: Tx, user_id: str, module_id: str, chapter_id: str | None = None) -> Any:
    return await course_service.get_module_course(content_deps(tx), actor_for(user_id), module_id, chapter_id)


async def test_a_foreign_module_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice")
        bob = await create_user(tx.conn, "Bob")
        return await read_course(tx, bob, alice["module"])

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.MODULE_NOT_FOUND


async def test_a_module_without_chapter_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=0)
        return await read_course(tx, alice["user"], alice["module"])

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.CHAPTER_NOT_IN_MODULE


async def test_a_module_without_generation_has_no_course(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        return await read_course(tx, alice["user"], alice["module"])

    screen = await rolled_back(database, run)
    parsed = ModulesCourseOutput.model_validate(screen)
    assert parsed.module.id == screen["module"]["id"]
    assert screen["module"]["position"] == 1
    assert screen["module"]["positionTotal"] == 3
    assert screen["selectedChapterId"] is not None
    assert screen["course"] is None
    assert screen["generation"] == {"status": "none", "version": None, "error": None}


async def test_a_ready_course_without_section_or_resource_is_minimal(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
            version=2,
        )
        return course_id, await read_course(tx, alice["user"], alice["module"], alice["chapter"])

    course_id, screen = await rolled_back(database, run)
    course = screen["course"]
    assert course is not None
    assert course["id"] == course_id
    assert course["version"] == 2
    assert course["status"] == "ready"
    assert course["readingMinutes"] == 1
    assert course["resourceCount"] == 0
    assert course["baseCourse"] is True
    assert course["chapter"]["hasCourse"] is False
    assert course["sections"] == []
    assert course["suggestions"] == []
    assert screen["generation"] == {"status": "ready", "version": 2, "error": None}


async def test_the_full_course_renders_sections_citations_suggestions_and_summary(
    database: Database,
) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(
            tx, "Alice", chapters=2, modules=7, module_index=2, formation_title="SAP S/4HANA Finance"
        )
        first, second = alice["chapters"]
        notion_id = await create_notion(tx.conn, alice["formation"], alice["module"], first, 1)
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
            version=2,
        )
        resource_id = await create_resource(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            chapter_id=first,
            kind="pdf",
            title="Guide FI",
            origin="learner",
            status="ready",
            storage_path=f"{alice['user']}/11111111-1111-4111-8111-111111111112/guide.pdf",
        )
        chunk_id = await create_chunk(
            tx,
            resource_id=resource_id,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            chapter_id=first,
        )
        first_section = await create_section(
            tx,
            course_id=course_id,
            owner_id=alice["user"],
            chapter_id=first,
            position=1,
            kind="text",
            anchor="section-1",
            title="Introduction",
            content_md="Bonjour le monde comptable.",
            origin="resource",
            notion_ids=[notion_id],
        )
        await create_citation(
            tx,
            section_id=first_section,
            owner_id=alice["user"],
            resource_id=resource_id,
            chunk_id=chunk_id,
            label="Guide FI",
            location={"page": 4},
        )
        await create_section(
            tx,
            course_id=course_id,
            owner_id=alice["user"],
            chapter_id=first,
            position=2,
            kind="retain",
            anchor="section-2",
            title=None,
            content_md=None,
            data={
                "points": ["La cle 40 debite", "La cle 50 credite"],
                "mnemonic": "D as in Debit",
                "left": {"title": "Debit", "body": "Emploi", "example": "Achat"},
                "right": {"title": "Credit"},
            },
            origin="tutor",
            notion_ids=[notion_id],
            version=2,
            reported=True,
        )
        summary_id = await create_summary(
            tx,
            user_id=alice["user"],
            chapter_id=first,
            course_id=course_id,
            body="Une piece a un en-tete.",
            feedback={"verdict": "good", "message": "Resume complet.", "missing": []},
        )
        await create_progress(tx, user_id=alice["user"], course_id=course_id, chapter_id=first, percent=60)
        screen = await read_course(tx, alice["user"], alice["module"])
        return {
            "screen": screen,
            "first": first,
            "second": second,
            "course": course_id,
            "section": first_section,
            "summary": summary_id,
        }

    seeded = await rolled_back(database, run)
    screen = seeded["screen"]
    course = screen["course"]
    assert course is not None
    assert screen["module"] == {
        "id": screen["module"]["id"],
        "position": 3,
        "positionTotal": 7,
        "title": "Partie 3",
    }
    assert screen["selectedChapterId"] == seeded["first"]
    assert screen["generation"] == {"status": "ready", "version": 2, "error": None}
    assert screen["chapters"] == [
        {"id": seeded["first"], "position": 1, "title": "Chapitre 1", "hasCourse": True, "percent": 60},
        {"id": seeded["second"], "position": 2, "title": "Chapitre 2", "hasCourse": False, "percent": 0},
    ]
    assert course["id"] == seeded["course"]
    assert course["status"] == "ready"
    assert course["baseCourse"] is False
    assert course["resourceCount"] == 1
    assert course["previousChapterId"] is None
    assert course["nextChapterId"] == seeded["second"]
    assert course["chapter"]["id"] == seeded["first"]
    assert course["chapter"]["hasCourse"] is True
    assert course["chapter"]["percent"] == 60
    assert course["progress"] == {"chapterPercent": 60, "coursePercent": 60, "updatedAt": None}
    assert course["summary"]["id"] == seeded["summary"]
    assert course["summary"]["status"] == "corrected"
    assert course["summary"]["feedback"] == {
        "verdict": "good",
        "message": "Resume complet.",
        "missing": [],
    }
    assert course["suggestions"] == []
    assert course["quiz"] == {
        "threshold": 80,
        "href": f"/formations/{screen['formation']['id']}/modules/{screen['module']['id']}",
    }
    assert course["readingMinutes"] >= 1
    assert len(course["sections"]) == 2
    first, second = course["sections"]
    assert first["id"] == seeded["section"]
    assert first["origin"] == "resource"
    assert len(first["notionIds"]) == 1
    assert len(first["citations"]) == 1
    assert first["citations"][0]["label"] == "Guide FI"
    assert first["citations"][0]["location"] == {"page": 4}
    assert first["citations"][0]["deleted"] is False
    assert second["origin"] == "tutor"
    assert second["reported"] is True
    assert second["data"]["mnemonic"] == "D as in Debit"
    assert second["citations"] == []


async def test_a_chapter_without_resource_offers_the_pending_suggestions(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
        )
        suggestion_id = await create_resource(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            chapter_id=alice["chapter"],
            kind="web",
            title="Plan comptable officiel",
            origin="tutor_suggestion",
            status="ready",
            url="https://doc.test/plan",
            suggestion_status="pending",
        )
        return course_id, suggestion_id, await read_course(tx, alice["user"], alice["module"])

    course_id, suggestion_id, screen = await rolled_back(database, run)
    course = screen["course"]
    assert course["id"] == course_id
    assert course["resourceCount"] == 0
    assert course["baseCourse"] is True
    assert course["suggestions"] == [
        {
            "id": suggestion_id,
            "title": "Plan comptable officiel",
            "url": "https://doc.test/plan",
            "reason": texts.SUGGESTION_REASON_COURSE,
        }
    ]


async def test_another_chapter_is_selected_and_the_neighbours_are_computed(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=2)
        first, second = alice["chapters"]
        course_id = await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
        )
        await create_section(
            tx,
            course_id=course_id,
            owner_id=alice["user"],
            chapter_id=first,
            anchor="section-1",
        )
        await create_progress(tx, user_id=alice["user"], course_id=course_id, chapter_id=first, percent=100)
        return first, second, await read_course(tx, alice["user"], alice["module"], second)

    first, second, screen = await rolled_back(database, run)
    course = screen["course"]
    assert screen["selectedChapterId"] == second
    assert course["chapter"]["id"] == second
    assert course["chapter"]["position"] == 2
    assert course["previousChapterId"] == first
    assert course["nextChapterId"] is None
    assert course["sections"] == []
    assert course["progress"] == {"chapterPercent": 0, "coursePercent": 100, "updatedAt": None}


async def test_a_generation_in_progress_renders_without_a_current_course(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
            version=1,
            status="generating",
            is_current=False,
        )
        return await read_course(tx, alice["user"], alice["module"])

    screen = await rolled_back(database, run)
    assert screen["course"] is None
    assert screen["generation"] == {"status": "generating", "version": 1, "error": None}


async def test_a_failed_generation_renders_its_message(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        alice = await seed_learner(tx, "Alice", chapters=1)
        await create_course(
            tx,
            owner_id=alice["user"],
            formation_id=alice["formation"],
            module_id=alice["module"],
            version=1,
            status="failed",
            is_current=False,
            error="Modele indisponible.",
        )
        return await read_course(tx, alice["user"], alice["module"])

    screen = await rolled_back(database, run)
    assert screen["course"] is None
    assert screen["generation"] == {
        "status": "failed",
        "version": 1,
        "error": "Modele indisponible.",
    }
