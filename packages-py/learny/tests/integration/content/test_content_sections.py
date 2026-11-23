"""[SPEC-2203] Section report and correction: optimistic guard, replay and brick suspension.

The same identifiers, the same expected codes, versions and events, on the local stack.
"""

from typing import Any

import pytest
from factories.course_support import (
    column,
    content_deps,
    create_brick,
    create_course,
    create_report,
    create_section,
    event_ids,
    seed_learner,
)
from factories.db_support import rolled_back
from factories.identity_support import actor_for, create_notion, create_user
from learny.content.application import sections as sections_service
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny_api.generated.models import CourseSectionsEditOutput, CourseSectionsReportOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2203")

EDIT_KEY = "edit-key-0001"
REPORT_KEY = "report-key-0001"


async def seed_course(tx: Tx) -> dict[str, Any]:
    seeded = await seed_learner(tx, "Alice", chapters=1)
    course_id = await create_course(
        tx,
        owner_id=seeded["user"],
        formation_id=seeded["formation"],
        module_id=seeded["module"],
    )
    section_id = await create_section(
        tx,
        course_id=course_id,
        owner_id=seeded["user"],
        chapter_id=seeded["chapter"],
        position=1,
        anchor="section-1",
        title="Titre",
        content_md="Contenu",
        origin="tutor",
    )
    seeded["course"] = course_id
    seeded["section"] = section_id
    return seeded


async def edit(tx: Tx, user_id: str, section_id: str, body: dict[str, Any], key: str | None = None) -> Any:
    return await sections_service.edit_course_section(
        content_deps(tx), actor_for(user_id), section_id, body, key
    )


async def report(tx: Tx, user_id: str, section_id: str, body: dict[str, Any], key: str | None = None) -> Any:
    return await sections_service.report_course_section(
        content_deps(tx), actor_for(user_id), section_id, body, key
    )


async def count_rows(tx: Tx, statement: str, **parameters: Any) -> int:
    result = await tx.conn.execute(text(statement), parameters)
    return int(result.scalar_one())


# --- course-sections.edit ------------------------------------------------------------------------


async def test_an_invalid_section_identifier_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        return await edit(tx, "11111111-1111-4111-8111-111111111111", "pas-un-uuid", {"expectedVersion": 1})

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.detail == texts.INVALID_IDENTIFIER.format(field="sectionId")


async def test_a_body_without_any_field_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        return await edit(tx, seeded["user"], seeded["section"], {"expectedVersion": 1})

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.extra["errors"] == [{"path": "body.contentMd", "message": texts.EDIT_NO_FIELD}]


async def test_an_invalid_request_key_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        return await edit(
            tx, seeded["user"], seeded["section"], {"expectedVersion": 1, "contentMd": "x"}, "court"
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.detail == texts.INVALID_REQUEST_KEY


async def test_a_foreign_or_missing_section_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        bob = await create_user(tx.conn, "Bob")
        return await edit(tx, bob, seeded["section"], {"expectedVersion": 1, "contentMd": "x"})

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.SECTION_NOT_FOUND


async def test_a_stale_read_receives_the_current_version(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        await tx.conn.execute(
            text("update public.course_sections set version = 3 where id = cast(:id as uuid)"),
            {"id": seeded["section"]},
        )
        return await edit(tx, seeded["user"], seeded["section"], {"expectedVersion": 2, "contentMd": "x"})

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "CONFLICT"
    assert error.value.detail == texts.SECTION_CHANGED_SINCE_READ
    assert error.value.extra["errors"] == [
        {"path": "expectedVersion", "message": texts.SECTION_VERSION_CURRENT.format(version=3)}
    ]


async def test_an_identical_content_is_not_rewritten(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        result = await edit(
            tx, seeded["user"], seeded["section"], {"expectedVersion": 1, "contentMd": "Contenu"}
        )
        events = await event_ids(tx, "course-section-edited:")
        revisions = await count_rows(tx, "select count(*) from public.course_section_revisions")
        return result, events, revisions

    result, events, revisions = await rolled_back(database, run)
    parsed = CourseSectionsEditOutput.model_validate(result)
    assert parsed.version == 1
    assert parsed.reported is False
    assert events == []
    assert revisions == 0


async def test_a_correction_resolves_the_reports_and_reactivates_the_bricks(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        notion_id = await create_notion(tx.conn, seeded["formation"], seeded["module"], seeded["chapter"], 1)
        await tx.conn.execute(
            text(
                "update public.course_sections set notion_ids = cast(:notions as uuid[])"
                " where id = cast(:id as uuid)"
            ),
            {"notions": [notion_id], "id": seeded["section"]},
        )
        brick_id = await create_brick(
            tx, owner_id=seeded["user"], formation_id=seeded["formation"], notion_ids=[notion_id]
        )
        report_id = await create_report(
            tx,
            owner_id=seeded["user"],
            section_id=seeded["section"],
            affected=[brick_id],
        )
        await tx.conn.execute(
            text("update public.course_sections set reported = true where id = cast(:id as uuid)"),
            {"id": seeded["section"]},
        )
        await tx.conn.execute(
            text("update public.bricks set status = 'reported' where id = cast(:id as uuid)"),
            {"id": brick_id},
        )
        result = await edit(
            tx,
            seeded["user"],
            seeded["section"],
            {"expectedVersion": 1, "title": "Titre corrige", "contentMd": "Nouveau"},
            EDIT_KEY,
        )
        events = await event_ids(tx, "course-section-edited:")
        brick_status = await column(tx, "bricks", "status", brick_id)
        report_status = await column(tx, "course_section_reports", "status", report_id)
        return result, events, brick_status, report_status, brick_id

    result, events, brick_status, report_status, brick_id = await rolled_back(database, run)
    parsed = CourseSectionsEditOutput.model_validate(result)
    assert parsed.version == 2
    assert parsed.title == "Titre corrige"
    assert parsed.reported is False
    assert events == [f"course-section-edited:{parsed.sectionId}:2"]
    assert brick_status == "active"
    assert report_status == "corrected"
    assert brick_id


async def test_a_report_is_lifted_even_without_a_content_change(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        await tx.conn.execute(
            text("update public.course_sections set reported = true where id = cast(:id as uuid)"),
            {"id": seeded["section"]},
        )
        result = await edit(
            tx, seeded["user"], seeded["section"], {"expectedVersion": 1, "contentMd": "Contenu"}
        )
        events = await event_ids(tx, "course-section-edited:")
        return result, events

    result, events = await rolled_back(database, run)
    assert result["reported"] is False
    assert len(events) == 1


async def test_a_recorded_correction_is_replayed_without_a_new_write(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        await tx.conn.execute(
            text(
                "update public.course_sections"
                " set edit_request_key = :key, version = 2"
                " where id = cast(:id as uuid)"
            ),
            {"key": EDIT_KEY, "id": seeded["section"]},
        )
        result = await edit(
            tx,
            seeded["user"],
            seeded["section"],
            {"expectedVersion": 1, "contentMd": "Nouveau"},
            EDIT_KEY,
        )
        events = await event_ids(tx, "course-section-edited:")
        revisions = await count_rows(tx, "select count(*) from public.course_section_revisions")
        return result, events, revisions

    result, events, revisions = await rolled_back(database, run)
    parsed = CourseSectionsEditOutput.model_validate(result)
    assert parsed.version == 2
    assert events == []
    assert revisions == 0


async def test_a_replay_that_no_longer_finds_the_section_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        await tx.conn.execute(
            text("update public.course_sections set edit_request_key = :key where id = cast(:id as uuid)"),
            {"key": EDIT_KEY, "id": seeded["section"]},
        )
        await tx.conn.execute(
            text("update public.courses set is_current = false where id = cast(:id as uuid)"),
            {"id": seeded["course"]},
        )
        return await edit(
            tx,
            seeded["user"],
            seeded["section"],
            {"expectedVersion": 1, "contentMd": "Nouveau"},
            EDIT_KEY,
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.SECTION_NOT_FOUND


# --- course-sections.report ----------------------------------------------------------------------


async def test_an_invalid_section_identifier_is_refused_on_report(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        return await report(tx, "11111111-1111-4111-8111-111111111111", "pas-un-uuid", {"reason": "Faux"})

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"


async def test_a_blank_reason_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        return await report(tx, seeded["user"], seeded["section"], {"reason": "   "})

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.extra["errors"][0]["path"] == "body.reason"


async def test_an_invalid_request_key_is_refused_on_report(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        return await report(tx, seeded["user"], seeded["section"], {"reason": "Faux"}, "court")

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.detail == texts.INVALID_REQUEST_KEY


async def test_a_recorded_report_is_replayed(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        report_id = await create_report(
            tx, owner_id=seeded["user"], section_id=seeded["section"], request_key=REPORT_KEY
        )
        result = await report(tx, seeded["user"], seeded["section"], {"reason": "Faux"}, REPORT_KEY)
        events = await event_ids(tx, "course-section-reported:")
        return result, events, report_id

    result, events, report_id = await rolled_back(database, run)
    assert CourseSectionsReportOutput.model_validate(result).reportId == report_id
    assert result["status"] == "open"
    assert result["reported"] is True
    assert events == []


async def test_the_open_report_is_returned_without_a_duplicate(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        report_id = await create_report(tx, owner_id=seeded["user"], section_id=seeded["section"])
        result = await report(tx, seeded["user"], seeded["section"], {"reason": "Faux"})
        events = await event_ids(tx, "course-section-reported:")
        total = await count_rows(
            tx,
            "select count(*) from public.course_section_reports where section_id = cast(:id as uuid)",
            id=seeded["section"],
        )
        return result, events, report_id, total

    result, events, report_id, total = await rolled_back(database, run)
    assert result["reportId"] == report_id
    assert events == []
    assert total == 1


async def test_a_foreign_or_missing_section_is_not_found_on_report(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        bob = await create_user(tx.conn, "Bob")
        return await report(tx, bob, seeded["section"], {"reason": "Faux"})

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.SECTION_NOT_FOUND


async def test_a_report_suspends_the_bricks_of_its_notions_and_emits_one_event(
    database: Database,
) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        notion_id = await create_notion(tx.conn, seeded["formation"], seeded["module"], seeded["chapter"], 1)
        await tx.conn.execute(
            text(
                "update public.course_sections set notion_ids = cast(:notions as uuid[])"
                " where id = cast(:id as uuid)"
            ),
            {"notions": [notion_id], "id": seeded["section"]},
        )
        brick_id = await create_brick(
            tx, owner_id=seeded["user"], formation_id=seeded["formation"], notion_ids=[notion_id]
        )
        result = await report(
            tx,
            seeded["user"],
            seeded["section"],
            {"reason": "The passage is wrong."},
            REPORT_KEY,
        )
        events = await event_ids(tx, "course-section-reported:")
        brick_status = await column(tx, "bricks", "status", brick_id)
        affected = await column(tx, "course_section_reports", "affected_brick_ids", result["reportId"])
        return result, events, brick_status, affected, brick_id

    result, events, brick_status, affected, brick_id = await rolled_back(database, run)
    parsed = CourseSectionsReportOutput.model_validate(result)
    assert parsed.status == "open"
    assert parsed.reported is True
    assert events == [f"course-section-reported:{parsed.reportId}"]
    assert brick_status == "reported"
    assert [str(value) for value in affected] == [brick_id]


# --- section bricks ------------------------------------------------------------------------------


async def test_nothing_is_touched_without_a_notion(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        notion_id = await create_notion(tx.conn, seeded["formation"], seeded["module"], seeded["chapter"], 1)
        brick_id = await create_brick(
            tx, owner_id=seeded["user"], formation_id=seeded["formation"], notion_ids=[notion_id]
        )
        found = await sections_service.suspend_bricks_for_notions(tx, seeded["user"], seeded["formation"], [])
        return found, await column(tx, "bricks", "status", brick_id)

    found, status = await rolled_back(database, run)
    assert found == []
    assert status == "active"


async def test_an_empty_list_is_returned_when_no_brick_shares_the_notions(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        notion_id = await create_notion(tx.conn, seeded["formation"], seeded["module"], seeded["chapter"], 1)
        other = await create_notion(tx.conn, seeded["formation"], seeded["module"], seeded["chapter"], 2)
        await create_brick(tx, owner_id=seeded["user"], formation_id=seeded["formation"], notion_ids=[other])
        return await sections_service.suspend_bricks_for_notions(
            tx, seeded["user"], seeded["formation"], [notion_id]
        )

    assert await rolled_back(database, run) == []


async def test_the_active_bricks_of_the_notions_are_suspended(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        notion_id = await create_notion(tx.conn, seeded["formation"], seeded["module"], seeded["chapter"], 1)
        first = await create_brick(
            tx, owner_id=seeded["user"], formation_id=seeded["formation"], notion_ids=[notion_id]
        )
        second = await create_brick(
            tx,
            owner_id=seeded["user"],
            formation_id=seeded["formation"],
            notion_ids=[notion_id],
            purpose="validation",
        )
        found = await sections_service.suspend_bricks_for_notions(
            tx, seeded["user"], seeded["formation"], [notion_id]
        )
        statuses = [await column(tx, "bricks", "status", brick_id) for brick_id in (first, second)]
        return found, statuses

    found, statuses = await rolled_back(database, run)
    assert len(found) == 2
    assert statuses == ["reported", "reported"]


async def test_nothing_is_reactivated_without_identifier(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        notion_id = await create_notion(tx.conn, seeded["formation"], seeded["module"], seeded["chapter"], 1)
        brick_id = await create_brick(
            tx,
            owner_id=seeded["user"],
            formation_id=seeded["formation"],
            notion_ids=[notion_id],
            status="reported",
        )
        await sections_service.reactivate_bricks(tx, seeded["user"], [])
        return await column(tx, "bricks", "status", brick_id)

    assert await rolled_back(database, run) == "reported"


async def test_the_bricks_listed_by_corrected_reports_are_reactivated(database: Database) -> None:
    async def run(tx: Tx) -> Any:
        seeded = await seed_course(tx)
        notion_id = await create_notion(tx.conn, seeded["formation"], seeded["module"], seeded["chapter"], 1)
        brick_id = await create_brick(
            tx,
            owner_id=seeded["user"],
            formation_id=seeded["formation"],
            notion_ids=[notion_id],
            status="reported",
        )
        await sections_service.reactivate_bricks(tx, seeded["user"], [brick_id])
        return await column(tx, "bricks", "status", brick_id)

    assert await rolled_back(database, run) == "active"
