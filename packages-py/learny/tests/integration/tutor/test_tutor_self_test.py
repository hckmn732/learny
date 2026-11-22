"""[SPEC-2204] Teste-moi: the pending question, the verdict, the mastery and the correction.

Ported from `packages/services/src/tutor-chat/self-test.test.ts` (SPEC-610 ET-7, BR-TUT-04,
ADR-0174): the brick, the activity and the attempt are real rows, and `apply_learning_result` runs
its own transaction, so the mastery read is the one the learning engine wrote.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import actor_for
from factories.tutor_support import (
    RecordingGateway,
    UnavailableGateway,
    create_global_quiz_slot,
    seed_tutor,
    tutor_deps,
)
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import tutor as texts
from learny.tutor.application.context import ConversationRef
from learny.tutor.application.self_test import answer_self_test, ask_self_test
from learny.tutor.application.stream import stream_reply
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2204")

CORRECT_ANSWER = "Cle 31 au credit du compte fournisseur."
WRONG_ANSWER = "Je ne sais pas."


async def ask(tx: Tx, seed: dict[str, Any], gateway: Any) -> dict[str, Any]:
    """Runs a Teste-moi turn and returns the metadata stored on the pending tutor message."""
    frames = [
        frame
        async for frame in await stream_reply(
            tutor_deps(tx, llm=gateway),
            actor_for(seed["user"]),
            seed["conversation"],
            {"text": "Teste-moi", "context": {"include": {}}, "followUp": "test_me"},
        )
    ]
    assert frames[-1] == "data: [DONE]\n\n"
    row = await tx.conn.execute(
        text(
            "select id::text as id, self_test from public.tutor_messages "
            "where conversation_id = cast(:id as uuid) and self_test is not null "
            "order by created_at desc, id desc limit 1"
        ),
        {"id": seed["conversation"]},
    )
    found = row.mappings().one()
    return {**dict(found["self_test"]), "messageId": str(found["id"])}


async def rows_of(tx: Tx, statement: str, **parameters: Any) -> list[dict[str, Any]]:
    result = await tx.conn.execute(text(statement), parameters)
    return [dict(row) for row in result.mappings().all()]


async def test_the_question_is_a_real_brick_activity_and_attempt(database: Database) -> None:
    async def run(
        tx: Tx,
    ) -> tuple[
        dict[str, Any],
        dict[str, Any],
        list[dict[str, Any]],
        list[dict[str, Any]],
        list[dict[str, Any]],
        list[dict[str, Any]],
    ]:
        seed = await seed_tutor(tx)
        gateway = RecordingGateway()
        pending = await ask(tx, seed, gateway)
        bricks = await rows_of(
            tx,
            "select type::text as type, purpose::text as purpose, status::text as status, "
            "current_version from public.bricks where formation_id = cast(:id as uuid)",
            id=seed["formation"],
        )
        versions = await rows_of(
            tx,
            "select version, origin::text as origin, created_by::text as created_by, fingerprint "
            "from public.brick_versions where brick_id = cast(:id as uuid)",
            id=pending["brickId"],
        )
        activities = await rows_of(
            tx,
            "select kind::text as kind, status::text as status, module_id::text as module_id "
            "from public.activities where id = cast(:id as uuid)",
            id=pending["activityId"],
        )
        attempts = await rows_of(
            tx,
            "select status::text as status, attempt_no from public.attempts where id = cast(:id as uuid)",
            id=pending["attemptId"],
        )
        return pending, seed, bricks, versions, activities, attempts

    pending, seed, bricks, versions, activities, attempts = await rolled_back(database, run)
    assert bricks == [
        {"type": "open_question", "purpose": "review", "status": "active", "current_version": 1}
    ]
    assert len(versions) == 1
    assert versions[0]["version"] == 1
    assert versions[0]["origin"] == "tutor"
    assert versions[0]["created_by"] == "tutor"
    assert versions[0]["fingerprint"]
    assert activities == [{"kind": "self_test", "status": "ready", "module_id": seed["module"]}]
    assert attempts == [{"status": "in_progress", "attempt_no": 1}]
    assert pending["notionId"] == seed["notion"]


async def test_the_question_alternates_between_the_two_fixtures(database: Database) -> None:
    async def run(tx: Tx) -> list[str]:
        seed = await seed_tutor(tx)
        gateway = RecordingGateway()
        first = await ask(tx, seed, gateway)
        await tx.conn.execute(
            text(
                'update public.tutor_messages set self_test = \'{"status":"answered"}\'::jsonb '
                "where id = cast(:id as uuid)"
            ),
            {"id": first["messageId"]},
        )
        await ask(tx, seed, gateway)
        return [call["scenario"] for call in gateway.calls]

    assert await rolled_back(database, run) == ["self-test-q1", "self-test-q2"]


async def test_a_missing_notion_is_a_validation_error(database: Database) -> None:
    async def run(tx: Tx) -> str:
        seed = await seed_tutor(tx)
        ref = ConversationRef(id=seed["conversation"], courseId=seed["course"], chapterId=seed["chapter"])
        with pytest.raises(AppError) as error:
            await ask_self_test(
                tutor_deps(tx),
                actor_for(seed["user"]),
                ref,
                {
                    "profile": {"tone": "vous", "courseLanguage": "fr"},
                    "promptBlock": "",
                    "gapNotionId": None,
                    "notionIds": [],
                    "notionLabels": {},
                    "formationId": seed["formation"],
                },
                seed["module"],
            )
        return error.value.code

    assert await rolled_back(database, run) == "VALIDATION_FAILED"


async def test_a_correct_answer_applies_the_mastery_and_writes_the_correction(
    database: Database,
) -> None:
    async def run(
        tx: Tx,
    ) -> tuple[
        dict[str, Any], dict[str, Any], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]
    ]:
        seed = await seed_tutor(tx)
        gateway = RecordingGateway()
        pending = await ask(tx, seed, gateway)
        view = await answer_self_test(
            tutor_deps(tx, llm=gateway), actor_for(seed["user"]), seed["conversation"], CORRECT_ANSWER
        )
        answers = await rows_of(
            tx,
            "select is_correct, score, max_score, graded_by::text as graded_by, position "
            "from public.answers where attempt_id = cast(:id as uuid)",
            id=pending["attemptId"],
        )
        attempts = await rows_of(
            tx,
            "select status::text as status, passed, score, duration_ms from public.attempts "
            "where id = cast(:id as uuid)",
            id=pending["attemptId"],
        )
        messages = await rows_of(
            tx,
            "select role::text as role, content, context, self_test from public.tutor_messages "
            "where conversation_id = cast(:id as uuid) order by created_at, id",
            id=seed["conversation"],
        )
        return view, pending, answers, attempts, messages

    view, pending, answers, attempts, messages = await rolled_back(database, run)
    message = view["message"]
    assert message["role"] == "tutor"
    assert message["selfTest"]["status"] == "answered"
    assert message["selfTest"]["correct"] is True
    assert isinstance(message["selfTest"]["masteryBefore"], int)
    assert isinstance(message["selfTest"]["masteryAfter"], int)
    assert [entry["key"] for entry in message["followUps"]] == ["test_me", "example"]
    assert len(answers) == 1
    assert answers[0]["is_correct"] is True
    assert float(answers[0]["score"]) == 1.0
    assert float(answers[0]["max_score"]) == 1.0
    assert answers[0]["graded_by"] == "tutor"
    assert answers[0]["position"] == 1
    assert len(attempts) == 1
    assert attempts[0]["status"] == "graded"
    assert attempts[0]["passed"] is True
    assert float(attempts[0]["score"]) == 100.0
    assert attempts[0]["duration_ms"] == 0
    verdict = texts.SELF_TEST_OK.format(
        label=pending["notionLabel"],
        before=message["selfTest"]["masteryBefore"],
        after=message["selfTest"]["masteryAfter"],
    )
    assert message["content"].endswith(verdict)
    learners = [row for row in messages if row["role"] == "learner" and row["content"] == CORRECT_ANSWER]
    assert len(learners) == 1
    assert learners[0]["context"] == {"include": {}, "selfTestAnswer": True}
    stored = [row for row in messages if row["self_test"] is not None]
    assert [row["self_test"]["status"] for row in stored] == ["answered", "answered"]


async def test_a_wrong_answer_is_put_back_in_the_evening_quiz(database: Database) -> None:
    async def run(tx: Tx) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        seed = await seed_tutor(tx)
        await create_global_quiz_slot(
            tx, user_id=seed["user"], formation_id=seed["formation"], starts_at="2026-11-11T17:00:00Z"
        )
        gateway = RecordingGateway()
        pending = await ask(tx, seed, gateway)
        view = await answer_self_test(
            tutor_deps(tx, llm=gateway), actor_for(seed["user"]), seed["conversation"], WRONG_ANSWER
        )
        states = await rows_of(
            tx,
            "select in_review, due_at from public.notion_states "
            "where user_id = cast(:user as uuid) and notion_id = cast(:notion as uuid)",
            user=seed["user"],
            notion=pending["notionId"],
        )
        return view, states

    view, states = await rolled_back(database, run)
    assert view["message"]["selfTest"]["correct"] is False
    assert view["message"]["content"].endswith(texts.SELF_TEST_QUIZ_TONIGHT.format(time="18:00"))
    assert states[0]["in_review"] is True
    assert states[0]["due_at"].isoformat().startswith("2026-11-11T23:00:00")


async def test_a_wrong_answer_without_a_slot_announces_tomorrow(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        seed = await seed_tutor(tx)
        gateway = RecordingGateway()
        await ask(tx, seed, gateway)
        return await answer_self_test(
            tutor_deps(tx, llm=gateway), actor_for(seed["user"]), seed["conversation"], WRONG_ANSWER
        )

    view = await rolled_back(database, run)
    assert view["message"]["content"].endswith(texts.SELF_TEST_QUIZ_TOMORROW)


async def test_an_answer_without_a_pending_question_is_a_conflict(database: Database) -> None:
    async def run(tx: Tx) -> str:
        seed = await seed_tutor(tx)
        with pytest.raises(AppError) as error:
            await answer_self_test(
                tutor_deps(tx), actor_for(seed["user"]), seed["conversation"], CORRECT_ANSWER
            )
        return error.value.code

    assert await rolled_back(database, run) == "CONFLICT"


async def test_a_pending_question_of_another_owner_is_invisible(database: Database) -> None:
    async def run(tx: Tx) -> str:
        owner = await seed_tutor(tx, "Proprietaire")
        intruder = await seed_tutor(tx, "Intrus", with_conversation=False)
        gateway = RecordingGateway()
        await ask(tx, owner, gateway)
        with pytest.raises(AppError) as error:
            await answer_self_test(
                tutor_deps(tx), actor_for(intruder["user"]), owner["conversation"], CORRECT_ANSWER
            )
        return error.value.code

    assert await rolled_back(database, run) == "CONFLICT"


async def test_a_failed_grading_leaves_the_attempt_ungraded(database: Database) -> None:
    async def run(tx: Tx) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]]:
        seed = await seed_tutor(tx)
        gateway = RecordingGateway()
        pending = await ask(tx, seed, gateway)
        with pytest.raises(AppError) as error:
            await answer_self_test(
                tutor_deps(tx, llm=UnavailableGateway()),
                actor_for(seed["user"]),
                seed["conversation"],
                CORRECT_ANSWER,
            )
        answers = await rows_of(
            tx,
            "select position from public.answers where attempt_id = cast(:id as uuid)",
            id=pending["attemptId"],
        )
        attempts = await rows_of(
            tx,
            "select status::text as status from public.attempts where id = cast(:id as uuid)",
            id=pending["attemptId"],
        )
        return error.value.code, answers, attempts

    code, answers, attempts = await rolled_back(database, run)
    assert code == "AI_UNAVAILABLE"
    assert answers == []
    assert attempts == [{"status": "in_progress"}]
