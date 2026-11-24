"""[SPEC-2207] Course generation consumed by the real worker: one version per completion event.

`chapter/contributions-completed` reaches `tutor.generate_course` through the dispatcher and the
runner, with the committed course fixtures of `LLM_MODE=mock`. The sourced chapter cites its passage
three times, the empty chapter stays a base course with two suggestions, the `course/generated` event
feeds `tutor.prepare_question_bank`, and a replay of the same event adds nothing.
"""

from typing import Any

import pytest
from factories.course_support import create_chunk, create_resource, seed_learner
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import create_notion
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import tutor as texts
from learny.tutor import public as tutor
from sqlalchemy import text
from support.jobs import count, delivery, emit_event, event_ids, harness

pytestmark = pytest.mark.spec("SPEC-2207")

CONSUMER = "tutor.generate_course"
BANK_CONSUMER = "tutor.prepare_question_bank"
EVENT = "chapter/contributions-completed"

SELECT_COURSES = text(
    "select id::text as id, version, status::text as status, is_current "
    "from public.courses where owner_id = cast(:user as uuid) order by version asc"
)
SELECT_KINDS = text(
    "select kind::text as kind from public.course_sections "
    "where course_id = cast(:course as uuid) and chapter_id = cast(:chapter as uuid) "
    "order by position asc"
)
COUNT_CITATIONS = text("select count(*)::int from public.citations where owner_id = cast(:user as uuid)")
COUNT_SUGGESTIONS = text(
    "select count(*)::int from public.resources where owner_id = cast(:user as uuid) "
    "and chapter_id = cast(:chapter as uuid) and origin = 'tutor_suggestion'"
)
COUNT_NOTIFICATIONS = text(
    "select count(*)::int from public.notifications where user_id = cast(:user as uuid) and dedupe_key = :key"
)
COUNT_BANK_JOBS = text(
    "select count(*)::int from public.question_bank_jobs where user_id = cast(:user as uuid)"
)


class FailingLlm:
    """A provider refusal: no chapter can be written, so the version is persisted as failed."""

    def session(self, *args: Any, **kwargs: Any) -> Any:
        raise AppError("AI_TASK_FAILED", texts.COURSE_TASK_FAILED)


async def seed_module(tx: Tx) -> dict[str, Any]:
    """Two chapters, one notion each, and one ready PDF in the first chapter only."""
    seed = await seed_learner(tx, "Alice", chapters=2, modules=1)
    notions = [
        await create_notion(tx.conn, seed["formation"], seed["module"], chapter, 1)
        for chapter in seed["chapters"]
    ]
    resource = await create_resource(
        tx,
        owner_id=seed["user"],
        formation_id=seed["formation"],
        chapter_id=seed["chapters"][0],
        kind="pdf",
        title="FI user guide",
        mime="application/pdf",
        status="ready",
        storage_path=f"{seed['user']}/00000000-0000-4000-8000-000000000001/guide.pdf",
    )
    chunk = await create_chunk(
        tx,
        resource_id=resource,
        owner_id=seed["user"],
        formation_id=seed["formation"],
        chapter_id=seed["chapters"][0],
        body="Every accounting entry is one document with a header and posts.",
    )
    return {**seed, "notions": notions, "resource": resource, "chunk": chunk}


def generation_key(module_id: str, version: str = "1:0:1") -> str:
    return f"course-generation:{module_id}:force:{version}"


async def test_a_completed_module_generates_one_course_and_requests_the_banks(
    database: Database,
) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        seed = await seed_module(tx)
        key = generation_key(seed["module"])
        event_id = await emit_event(
            tx,
            EVENT,
            {
                "userId": seed["user"],
                "moduleId": seed["module"],
                "chapterId": None,
                "force": True,
            },
            key,
        )
        worker = harness(tx, (CONSUMER, BANK_CONSUMER))

        first = await worker.drain()
        courses = [
            dict(row)
            for row in (await tx.conn.execute(SELECT_COURSES, {"user": seed["user"]})).mappings().all()
        ]
        course_id = courses[0]["id"] if courses else ""
        kinds = [
            str(row["kind"])
            for row in (
                await tx.conn.execute(SELECT_KINDS, {"course": course_id, "chapter": seed["chapters"][0]})
            )
            .mappings()
            .all()
        ]
        citations = await count(tx, str(COUNT_CITATIONS.text), user=seed["user"])
        suggestions = await count(
            tx, str(COUNT_SUGGESTIONS.text), user=seed["user"], chapter=seed["chapters"][1]
        )
        generated = await event_ids(tx, "course-generated:")
        notifications = await count(
            tx,
            str(COUNT_NOTIFICATIONS.text),
            user=seed["user"],
            key=f"course-ready:{course_id}",
        )
        state = await delivery(tx, event_id, CONSUMER)

        # The `course/generated` event is dispatched on the next tick and feeds the banks.
        second = await worker.drain()
        bank_jobs = await count(tx, str(COUNT_BANK_JOBS.text), user=seed["user"])
        bank = await delivery(tx, generated[0], BANK_CONSUMER) if generated else None

        # Nothing is left: a third tick creates no delivery and changes no effect.
        third = await worker.drain()
        courses_after = await count(
            tx,
            "select count(*)::int from public.courses where owner_id = cast(:user as uuid)",
            user=seed["user"],
        )
        bank_jobs_after = await count(tx, str(COUNT_BANK_JOBS.text), user=seed["user"])
        generated_after = await event_ids(tx, "course-generated:")
        return {
            "seed": seed,
            "first": first,
            "courses": courses,
            "kinds": kinds,
            "citations": citations,
            "suggestions": suggestions,
            "generated": generated,
            "notifications": notifications,
            "state": state,
            "second": second,
            "bank_jobs": bank_jobs,
            "bank": bank,
            "third": third,
            "courses_after": courses_after,
            "bank_jobs_after": bank_jobs_after,
            "generated_after": generated_after,
        }

    result = await rolled_back(database, run)

    assert result["first"][1] == 1
    assert [(course["version"], course["status"], course["is_current"]) for course in result["courses"]] == [
        (1, "ready", True)
    ]
    assert result["kinds"] == [
        "text",
        "flash_question",
        "text",
        "text",
        "dont_confuse",
        "tutor_completed",
        "retain",
        "summary_prompt",
    ]
    assert result["citations"] == 3
    assert result["suggestions"] == 2
    assert result["notifications"] == 1
    assert result["state"] is not None
    assert result["state"]["status"] == "done"
    assert result["generated"] == [result["generated"][0]]
    assert result["second"][1] >= 1
    assert result["bank"] is not None
    assert result["bank"]["status"] == "done"
    # One job per notion and format of the module: two notions, four formats.
    assert result["bank_jobs"] == 8
    assert result["third"][1] == 0
    assert result["courses_after"] == 1
    assert result["bank_jobs_after"] == result["bank_jobs"]
    assert result["generated_after"] == result["generated"]


async def test_a_second_generation_key_creates_the_next_version(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        seed = await seed_module(tx)
        worker = harness(tx, (CONSUMER,))
        for version in ("1:0:1", "2:0:1"):
            await emit_event(
                tx,
                EVENT,
                {
                    "userId": seed["user"],
                    "moduleId": seed["module"],
                    "chapterId": None,
                    "force": True,
                },
                generation_key(seed["module"], version),
            )
            await worker.drain()
        courses = [
            dict(row)
            for row in (await tx.conn.execute(SELECT_COURSES, {"user": seed["user"]})).mappings().all()
        ]
        generated = await event_ids(tx, "course-generated:")
        return {"courses": courses, "generated": generated}

    result = await rolled_back(database, run)

    assert [(course["version"], course["is_current"]) for course in result["courses"]] == [
        (1, False),
        (2, True),
    ]
    assert len(result["generated"]) == 2


async def test_a_failed_generation_is_persisted_and_a_redelivery_does_nothing(
    database: Database,
) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        seed = await seed_module(tx)
        key = generation_key(seed["module"])
        deps = engagement_deps(tx)
        deps.llm = FailingLlm()  # type: ignore[assignment]
        with pytest.raises(AppError) as raised:
            await tutor.generate_course(deps, seed["user"], seed["module"], key)
        failed = [
            dict(row)
            for row in (await tx.conn.execute(SELECT_COURSES, {"user": seed["user"]})).mappings().all()
        ]
        failures = await count(
            tx,
            "select count(*)::int from public.notifications where user_id = cast(:user as uuid) "
            "and type = 'ai_task_failed'",
            user=seed["user"],
        )

        # The completion event arrives afterwards: the persisted failed version is returned and the
        # consumer publishes nothing, so a redelivery has no second effect (CL-2, CA-4).
        event_id = await emit_event(
            tx,
            EVENT,
            {
                "userId": seed["user"],
                "moduleId": seed["module"],
                "chapterId": None,
                "force": True,
            },
            key,
        )
        worker = harness(tx, (CONSUMER,))
        await worker.drain()
        after = [
            dict(row)
            for row in (await tx.conn.execute(SELECT_COURSES, {"user": seed["user"]})).mappings().all()
        ]
        return {
            "code": raised.value.code,
            "failed": failed,
            "failures": failures,
            "after": after,
            "generated": await event_ids(tx, "course-generated:"),
            "state": await delivery(tx, event_id, CONSUMER),
        }

    result = await rolled_back(database, run)

    assert result["code"] == "AI_TASK_FAILED"
    assert [(course["version"], course["status"], course["is_current"]) for course in result["failed"]] == [
        (1, "failed", False)
    ]
    assert result["failures"] == 1
    assert result["after"] == result["failed"]
    assert result["generated"] == []
    assert result["state"] is not None
    assert result["state"]["status"] == "done"


async def test_an_invalid_payload_fails_without_retry(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        seed = await seed_module(tx)
        event_id = await emit_event(
            tx,
            EVENT,
            {"userId": seed["user"]},
            generation_key(seed["module"], "invalid"),
        )
        worker = harness(tx, (CONSUMER,))
        first = await worker.drain()
        state = await delivery(tx, event_id, CONSUMER)
        second = await worker.drain()
        state_after = await delivery(tx, event_id, CONSUMER)
        courses = await count(
            tx,
            "select count(*)::int from public.courses where owner_id = cast(:user as uuid)",
            user=seed["user"],
        )
        return {
            "first": first,
            "state": state,
            "second": second,
            "state_after": state_after,
            "courses": courses,
        }

    result = await rolled_back(database, run)

    # The dispatcher refuses the payload itself: the delivery is `failed` at the first tick, the
    # runner never claims it and no version is written (CL-1).
    assert result["first"][1] == 0
    assert result["state"] is not None
    assert result["state"]["status"] == "failed"
    assert result["state"]["attempts"] == 0
    assert result["second"][1] == 0
    assert result["state_after"] == result["state"]
    assert result["courses"] == 0
