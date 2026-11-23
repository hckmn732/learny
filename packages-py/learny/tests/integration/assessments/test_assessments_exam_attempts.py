"""[SPEC-2202] Attempt, submission and result of a mock exam (SPEC-614, EF-1 to EF-4).

Port of the useful cases of `packages/services/src/mock-exams/attempt.ts`: the single running exam
of a formation is resumed, a guide format must be confirmed first, the answers are graded by code
once, the deadline is an absolute instant with a five-second tolerance, and the result separates the
studied score from the diagnostic one.
"""

import json
from datetime import timedelta
from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.identity_support import (
    FIXED,
    actor_for,
    count,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    identifier,
    one,
)
from learny.assessments.application import exam_attempts as service
from learny.assessments.application import exams as answers_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import (
    ExamAttemptsCreateOutput,
    ExamAttemptsGetOutput,
    ExamAttemptsResultOutput,
    ExamAttemptsSubmitOutput,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


def choice_document(notion_id: str, *, stem: str = "Which account increases on debit?") -> dict[str, Any]:
    """One single-choice question whose first option is the correct one."""
    return {
        "stem": stem,
        "mode": "single",
        "options": [
            {"id": "a", "text": "The bank account", "correct": True, "notionId": notion_id},
            {"id": "b", "text": "The capital account", "correct": False, "notionId": notion_id},
        ],
        "explanation": "The receipt increases the bank account on the debit side.",
        "objective": "Tell an asset account from a liability account",
        "sources": [],
    }


async def create_brick(conn: Any, seed: dict[str, Any], notion_id: str, *, stem: str) -> dict[str, str]:
    """One exam brick of the given notion and its current version."""
    brick_id = await identifier(
        conn,
        """
        insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
        values (
          cast(:owner as uuid), cast(:formation as uuid), 'choice_question',
          array[cast(:notion as uuid)], 'exam', 'active'
        )
        returning id::text as id
        """,
        owner=seed["userId"],
        formation=seed["formationId"],
        notion=notion_id,
    )
    version_id = await identifier(
        conn,
        """
        insert into public.brick_versions (brick_id, version, payload, origin, created_by)
        values (cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor')
        returning id::text as id
        """,
        brick=brick_id,
        payload=json.dumps(choice_document(notion_id, stem=stem)),
    )
    return {"brickId": brick_id, "versionId": version_id}


async def seed_exam(conn: Any, *, bricks: int = 2) -> dict[str, Any]:
    """One learner, one formation, two modules and a small exam-purpose bank."""
    user_id = await create_user(conn, "Alice", timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    first = await create_module(conn, formation_id, 1, title="Double entry", status="open")
    second = await create_module(conn, formation_id, 2, title="Closing", status="locked")
    first_chapter = await create_chapter(conn, formation_id, first)
    second_chapter = await create_chapter(conn, formation_id, second)
    first_notion = await create_notion(conn, formation_id, first, first_chapter, position=1)
    second_notion = await create_notion(conn, formation_id, second, second_chapter, position=1)
    seed: dict[str, Any] = {
        "userId": user_id,
        "formationId": formation_id,
        "firstModule": first,
        "firstNotion": first_notion,
        "secondNotion": second_notion,
    }
    created: list[dict[str, str]] = []
    if bricks > 0:
        created.append(await create_brick(conn, seed, first_notion, stem="Which account increases on debit?"))
    if bricks > 1:
        created.append(await create_brick(conn, seed, second_notion, stem="What does a closing entry clear?"))
    seed["bricks"] = created
    return seed


async def submit_answer(tx: Any, seed: dict[str, Any], attempt_id: str, position: int, option: str) -> None:
    """Stores one answer through the ported use case, before the deadline."""
    await answers_service.save_exam_answer(
        assessment_deps(tx),
        actor_for(seed["userId"]),
        attempt_id,
        position,
        {"response": {"optionIds": [option]}, "timeMs": 1200},
    )


async def event_ids(tx: Any, name: str) -> list[str]:
    """Every outbox event of one name, in insertion order."""
    rows = await tx.conn.execute(
        text("select event_id from public.event_outbox where name = :name order by event_id"),
        {"name": name},
    )
    return [str(row["event_id"]) for row in rows.mappings().all()]


async def test_starting_an_exam_materialises_the_questions(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], str, Any]:
        seed = await seed_exam(tx.conn)
        result = await service.start_exam_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["formationId"]
        )
        attempt = await one(
            tx.conn,
            """
            select at.status::text as status,
                   at.deadline_at,
                   at.started_at,
                   count(a.id)::int as answers
              from public.attempts at
              join public.answers a on a.attempt_id = at.id
             where at.id = cast(:attempt as uuid)
             group by at.id
            """,
            attempt=result["attemptId"],
        )
        return result, result["attemptId"], attempt

    result, attempt_id, attempt = await rolled_back(database, run)
    parsed = ExamAttemptsCreateOutput.model_validate(result)
    assert parsed.attemptId == attempt_id
    assert parsed.resumed is None
    assert attempt["status"] == "in_progress"
    assert attempt["answers"] == 2
    assert attempt["started_at"] == FIXED
    assert attempt["deadline_at"] == FIXED + timedelta(minutes=40)


async def test_a_second_start_resumes_the_running_exam(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], dict[str, Any], int, list[str]]:
        seed = await seed_exam(tx.conn)
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        first = await service.start_exam_attempt(deps, actor, seed["formationId"])
        second = await service.start_exam_attempt(deps, actor, seed["formationId"])
        total = await count(
            tx.conn,
            "select count(*)::int as count from public.attempts where user_id = cast(:user as uuid)",
            user=seed["userId"],
        )
        return first, second, total, await event_ids(tx, "exam/started")

    first, second, total, events = await rolled_back(database, run)
    assert second["attemptId"] == first["attemptId"]
    assert ExamAttemptsCreateOutput.model_validate(second).resumed is True
    assert total == 1
    assert events == [f"exam-started:{first['attemptId']}"]


async def test_a_guide_format_must_be_confirmed_first(database: Database) -> None:
    async def run(tx: Any) -> str:
        seed = await seed_exam(tx.conn)
        await one(
            tx.conn,
            """
            insert into public.resources (
              owner_id, formation_id, kind, title, status, metadata, storage_path
            ) values (
              cast(:owner as uuid), cast(:formation as uuid), 'exam_guide', 'Guide', 'ready',
              cast(:metadata as jsonb), :storage
            )
            returning id::text as id
            """,
            owner=seed["userId"],
            formation=seed["formationId"],
            metadata=json.dumps({"examFormat": {"questions": 2, "durationMin": 20, "threshold": 70}}),
            storage=f"{seed['userId']}/{seed['formationId']}/guide.pdf",
        )
        with pytest.raises(AppError) as error:
            await service.start_exam_attempt(
                assessment_deps(tx), actor_for(seed["userId"]), seed["formationId"]
            )
        return error.value.code

    assert await rolled_back(database, run) == "FORMAT_NOT_CONFIRMED"


async def test_an_exam_without_a_bank_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> str:
        seed = await seed_exam(tx.conn, bricks=0)
        with pytest.raises(AppError) as error:
            await service.start_exam_attempt(
                assessment_deps(tx), actor_for(seed["userId"]), seed["formationId"]
            )
        return error.value.code

    assert await rolled_back(database, run) == "CONFLICT"


async def test_the_read_model_hides_the_correction_while_running(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_exam(tx.conn)
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        started = await service.start_exam_attempt(deps, actor, seed["formationId"])
        await submit_answer(tx, seed, started["attemptId"], 1, "a")
        return await service.get_exam_attempt(deps, actor, started["attemptId"])

    dto = await rolled_back(database, run)
    parsed = ExamAttemptsGetOutput.model_validate(dto)
    assert parsed.status == "in_progress"
    assert parsed.threshold == 70
    assert parsed.total == 2
    assert parsed.remainingSeconds == 2400
    assert parsed.answeredCount == 1
    assert parsed.markedCount == 0
    first = parsed.questions[0]
    assert first.type == "choice_question"
    assert first.typeLabel == "Choix unique"
    assert first.response == {"optionIds": ["a"]}
    assert first.feedback is None
    assert "correct" not in json.dumps(first.payload)


async def test_submitting_grades_the_attempt_once(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], dict[str, Any], Any, list[str]]:
        seed = await seed_exam(tx.conn)
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        started = await service.start_exam_attempt(deps, actor, seed["formationId"])
        await submit_answer(tx, seed, started["attemptId"], 1, "a")
        await submit_answer(tx, seed, started["attemptId"], 2, "b")
        first = await service.submit_exam(deps, actor, started["attemptId"])
        second = await service.submit_exam(deps, actor, started["attemptId"])
        graded = await one(
            tx.conn,
            """
            select status::text as status, score::text as score, passed,
                   per_notion, review_feedback, duration_ms
              from public.attempts where id = cast(:attempt as uuid)
            """,
            attempt=started["attemptId"],
        )
        return first, second, graded, await event_ids(tx, "exam/submitted")

    first, second, graded, events = await rolled_back(database, run)
    parsed = ExamAttemptsSubmitOutput.model_validate(
        {key: first[key] for key in ("status", "unansweredCount", "markedCount")}
    )
    assert parsed.status == "graded"
    assert parsed.unansweredCount == 0
    assert parsed.markedCount == 0
    assert second["status"] == "graded"
    assert graded["status"] == "graded"
    assert float(graded["score"]) == 50
    assert graded["passed"] is False
    assert len(graded["per_notion"]) == 2
    assert graded["duration_ms"] >= 0
    assert graded["review_feedback"]["timedOut"] is False
    assert graded["review_feedback"]["plan"]
    assert len(events) == 1
    assert events[0].startswith("exam-submitted:")


async def test_an_expired_attempt_is_graded_lazily(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], dict[str, Any]]:
        seed = await seed_exam(tx.conn)
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        started = await service.start_exam_attempt(deps, actor, seed["formationId"])
        await submit_answer(tx, seed, started["attemptId"], 1, "a")
        # The deadline is past the five-second tolerance: the read model submits it.
        await tx.conn.execute(
            text(
                "update public.attempts set deadline_at = cast(:deadline as timestamptz) "
                "where id = cast(:attempt as uuid)"
            ),
            {
                "deadline": "2026-11-11T12:10:00Z",
                "attempt": started["attemptId"],
            },
        )
        dto = await service.get_exam_attempt(deps, actor, started["attemptId"])
        result = await service.get_exam_result(deps, actor, started["attemptId"])
        return dto, result

    dto, result = await rolled_back(database, run)
    assert ExamAttemptsGetOutput.model_validate(dto).status == "graded"
    parsed = ExamAttemptsResultOutput.model_validate(result)
    assert parsed.status == "graded"
    assert parsed.timedOut is True
    assert parsed.answeredCount == 1
    assert parsed.total == 2
    assert float(parsed.score) == 50
    assert parsed.studied.total == 1
    assert parsed.studied.correct == 1
    assert parsed.diagnostic.total == 1
    assert parsed.diagnostic.correct == 0
    assert [module.label for module in parsed.modules] == ["Double entry", "Closing"]


async def test_a_deadline_trigger_before_the_tolerance_changes_nothing(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_exam(tx.conn)
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        started = await service.start_exam_attempt(deps, actor, seed["formationId"])
        return await service.submit_exam(deps, actor, started["attemptId"], trigger="deadline")

    result = await rolled_back(database, run)
    assert result["status"] == "in_progress"
    assert result["timedOut"] is False


async def test_the_result_of_a_running_exam_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> str:
        seed = await seed_exam(tx.conn)
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        started = await service.start_exam_attempt(deps, actor, seed["formationId"])
        with pytest.raises(AppError) as error:
            await service.get_exam_result(deps, actor, started["attemptId"])
        return error.value.code

    assert await rolled_back(database, run) == "CONFLICT"


async def test_the_result_lists_the_gaps_of_the_studied_modules(database: Database) -> None:
    async def run(tx: Any) -> dict[str, Any]:
        seed = await seed_exam(tx.conn)
        deps = assessment_deps(tx)
        actor = actor_for(seed["userId"])
        started = await service.start_exam_attempt(deps, actor, seed["formationId"])
        # The first question is the studied one: a wrong answer becomes a gap.
        await submit_answer(tx, seed, started["attemptId"], 1, "b")
        await submit_answer(tx, seed, started["attemptId"], 2, "a")
        await service.submit_exam(deps, actor, started["attemptId"])
        return await service.get_exam_result(deps, actor, started["attemptId"])

    parsed = ExamAttemptsResultOutput.model_validate(await rolled_back(database, run))
    assert parsed.studied.correct == 0
    assert len(parsed.gaps) == 1
    assert parsed.gaps[0].notionLabel
    assert parsed.review[0].given == "The capital account"
    assert parsed.review[0].expected == "The bank account"
    assert parsed.review[1].expected is None


async def test_another_learner_sees_no_exam(database: Database) -> None:
    async def run(tx: Any) -> tuple[str, str]:
        seed = await seed_exam(tx.conn)
        deps = assessment_deps(tx)
        started = await service.start_exam_attempt(deps, actor_for(seed["userId"]), seed["formationId"])
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        with pytest.raises(AppError) as read_error:
            await service.get_exam_attempt(deps, actor_for(bob), started["attemptId"])
        with pytest.raises(AppError) as submit_error:
            await service.submit_exam(deps, actor_for(bob), started["attemptId"])
        return read_error.value.code, submit_error.value.code

    read_code, submit_code = await rolled_back(database, run)
    assert read_code == "NOT_FOUND"
    assert submit_code == "NOT_FOUND"
