"""[SPEC-2202] Read model, drafts and immediate correction of a validation quiz (SPEC-611).

A question that is not checked never carries its correction, a draft is recorded without grading, a
checked question is graded by code and locked, and a closed attempt or a foreign attempt is refused.
"""

import json
from collections.abc import Callable
from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    one,
)
from learny.assessments.application import quiz as quiz_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from learny_api.generated.models import (
    QuizAnswersCheckOutput,
    QuizAnswersSaveOutput,
    QuizAttemptsGetOutput,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


def choice_payload(notion_id: str) -> dict[str, Any]:
    """A single-choice question whose first option is the correct one."""
    return {
        "stem": "Which account increases on debit?",
        "mode": "single",
        "options": [
            {"id": "a", "text": "The bank account", "correct": True, "notionId": notion_id},
            {"id": "b", "text": "The capital account", "correct": False, "notionId": notion_id},
        ],
        "explanation": "The receipt increases the bank account on the debit side.",
        "objective": "Tell an asset account from a liability account",
        "sources": [],
    }


def open_payload(notion_id: str) -> dict[str, Any]:
    """An open question, graded by the tutor and never by code."""
    return {
        "stem": "Explain the double-entry principle.",
        "expectedElements": ["Two accounts", "Same amount"],
        "criteria": [
            {"key": "accounts", "label": "Two accounts", "points": 2, "description": ""},
        ],
        "modelAnswer": "Each transaction is recorded twice, for the same amount.",
        "explanation": "Every entry has a debit and a credit of the same amount.",
        "objective": "State the double-entry principle",
        "sources": [],
    }


async def seed_attempt(
    conn: Any,
    *,
    builder: Callable[[str], dict[str, Any]],
    brick_type: str,
    status: str = "in_progress",
) -> dict[str, Any]:
    """One learner, one formation, one brick version and one attempt holding a single item."""
    user_id = await create_user(conn, "Alice", timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    module_id = await create_module(conn, formation_id, 1, title="Double entry", status="validated")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id)
    document = builder(notion_id)
    brick_id = await one(
        conn,
        """
        insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
        values (
          cast(:user as uuid), cast(:formation as uuid), cast(:type as public.brick_type),
          array[cast(:notion as uuid)], 'validation', 'active'
        )
        returning id::text as id
        """,
        user=user_id,
        formation=formation_id,
        type=brick_type,
        notion=notion_id,
    )
    version_id = await one(
        conn,
        """
        insert into public.brick_versions (brick_id, version, payload, origin, created_by)
        values (cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor')
        returning id::text as id
        """,
        brick=str(brick_id["id"]),
        payload=json.dumps(document),
    )
    items = [
        {
            "brickId": str(brick_id["id"]),
            "brickVersionId": str(version_id["id"]),
            "notionId": notion_id,
            "notionLabel": "Double entry",
            "type": brick_type,
            "payload": document,
        }
    ]
    activity_id = await one(
        conn,
        """
        insert into public.activities (
          owner_id, formation_id, module_id, kind, config, items, status
        ) values (
          cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
          'validation_quiz', cast(:config as jsonb), cast(:items as jsonb), 'ready'
        )
        returning id::text as id
        """,
        user=user_id,
        formation=formation_id,
        module=str(module_id),
        config=json.dumps({"threshold": 80}),
        items=json.dumps(items),
    )
    attempt_id = await one(
        conn,
        """
        insert into public.attempts (user_id, activity_id, attempt_no, status, started_at)
        values (
          cast(:user as uuid), cast(:activity as uuid), 1, cast(:status as public.attempt_status),
          cast('2026-11-11T12:00:00Z' as timestamptz)
        )
        returning id::text as id
        """,
        user=user_id,
        activity=str(activity_id["id"]),
        status=status,
    )
    await conn.execute(
        text(
            """
            insert into public.answers (attempt_id, brick_version_id, position, response, max_score)
            values (cast(:attempt as uuid), cast(:version as uuid), 1, '{}'::jsonb, 1)
            """
        ),
        {"attempt": str(attempt_id["id"]), "version": str(version_id["id"])},
    )
    return {
        "userId": user_id,
        "formationId": formation_id,
        "attemptId": str(attempt_id["id"]),
        "versionId": str(version_id["id"]),
        "notionId": notion_id,
    }


async def read_answer(conn: Any, attempt_id: str) -> dict[str, Any]:
    """The single answer row of the attempt, as a plain mapping."""
    found = await one(
        conn,
        """
        select response, is_correct, score::text as score, max_score::text as max_score,
               time_ms, graded_by::text as graded_by, feedback,
               chosen_distractor_notion_id::text as chosen_distractor_notion_id
          from public.answers where attempt_id = cast(:attempt as uuid)
        """,
        attempt=attempt_id,
    )
    return dict(found)


async def test_the_read_model_hides_the_correction_of_an_unanswered_question(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_attempt(tx.conn, builder=choice_payload, brick_type="choice_question")
        dto = await quiz_service.get_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )
        return dto, seed

    dto, seed = await rolled_back(database, run)
    parsed = QuizAttemptsGetOutput.model_validate(dto)
    assert parsed.kind == "validation_quiz"
    assert parsed.threshold == 80
    assert parsed.total == 1
    question = parsed.questions[0]
    assert question.state == "unanswered"
    assert question.type == "choice_question"
    assert question.typeLabel == "Choix unique"
    assert question.notionId == seed["notionId"]
    assert question.maxScore == 1
    assert question.feedback is None
    assert "correct" not in json.dumps(question.payload)


async def test_a_draft_is_recorded_without_grading(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_attempt(tx.conn, builder=choice_payload, brick_type="choice_question")
        saved = await quiz_service.save_draft(
            assessment_deps(tx),
            actor_for(seed["userId"]),
            seed["attemptId"],
            1,
            {"response": {"optionIds": ["a"]}, "timeMs": 4200},
        )
        answer = await read_answer(tx.conn, seed["attemptId"])
        dto = await quiz_service.get_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )
        return saved, answer, dto

    saved, answer, dto = await rolled_back(database, run)
    assert QuizAnswersSaveOutput.model_validate(saved).position == 1
    assert answer["is_correct"] is None
    assert answer["graded_by"] is None
    assert answer["time_ms"] == 4200
    assert answer["response"] == {"optionIds": ["a"]}
    assert QuizAttemptsGetOutput.model_validate(dto).questions[0].state == "draft"


async def test_checking_a_correct_answer_grades_and_locks_it(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_attempt(tx.conn, builder=choice_payload, brick_type="choice_question")
        checked = await quiz_service.check_answer(
            assessment_deps(tx),
            actor_for(seed["userId"]),
            seed["attemptId"],
            1,
            {"response": {"optionIds": ["a"]}, "timeMs": 1500},
        )
        answer = await read_answer(tx.conn, seed["attemptId"])
        dto = await quiz_service.get_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )
        return checked, answer, dto

    checked, answer, dto = await rolled_back(database, run)
    parsed = QuizAnswersCheckOutput.model_validate(checked)
    assert parsed.locked is True
    assert parsed.position == 1
    assert parsed.feedback.isCorrect is True
    assert parsed.feedback.title == texts.GRADE_FEEDBACK_EXACT
    assert float(parsed.feedback.score or 0) == 1
    correction = parsed.feedback.correction
    assert correction is not None
    assert getattr(correction, "kind", None) == "choice_question"
    assert answer["graded_by"] == "code"
    assert answer["is_correct"] is True
    assert float(answer["score"]) == 1
    question = QuizAttemptsGetOutput.model_validate(dto).questions[0]
    assert question.state == "checked"
    assert question.feedback is not None
    assert question.feedback.isCorrect is True


async def test_checking_a_wrong_answer_reports_the_expected_option(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_attempt(tx.conn, builder=choice_payload, brick_type="choice_question")
        return await quiz_service.check_answer(
            assessment_deps(tx),
            actor_for(seed["userId"]),
            seed["attemptId"],
            1,
            {"response": {"optionIds": ["b"]}, "timeMs": 900},
        )

    checked = await rolled_back(database, run)
    parsed = QuizAnswersCheckOutput.model_validate(checked)
    assert parsed.feedback.isCorrect is False
    assert parsed.feedback.title == texts.GRADE_FEEDBACK_APPROXIMATE
    correction = parsed.feedback.correction
    assert correction is not None
    options = {option.id: option.correct for option in getattr(correction, "options", [])}
    assert options == {"a": True, "b": False}


async def test_a_second_check_returns_the_stored_correction(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_attempt(tx.conn, builder=choice_payload, brick_type="choice_question")
        first = await quiz_service.check_answer(
            assessment_deps(tx),
            actor_for(seed["userId"]),
            seed["attemptId"],
            1,
            {"response": {"optionIds": ["a"]}, "timeMs": 1500},
        )
        second = await quiz_service.check_answer(
            assessment_deps(tx),
            actor_for(seed["userId"]),
            seed["attemptId"],
            1,
            {"response": {"optionIds": ["b"]}, "timeMs": 1500},
        )
        answer = await read_answer(tx.conn, seed["attemptId"])
        return first, second, answer

    first, second, answer = await rolled_back(database, run)
    assert first == second
    assert answer["is_correct"] is True


async def test_an_open_answer_is_recorded_and_waits_for_the_tutor(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_attempt(tx.conn, builder=open_payload, brick_type="open_question")
        checked = await quiz_service.check_answer(
            assessment_deps(tx),
            actor_for(seed["userId"]),
            seed["attemptId"],
            1,
            {"response": {"text": "Each entry is recorded twice."}, "timeMs": 3000},
        )
        answer = await read_answer(tx.conn, seed["attemptId"])
        dto = await quiz_service.get_attempt(
            assessment_deps(tx), actor_for(seed["userId"]), seed["attemptId"]
        )
        return checked, answer, dto

    checked, answer, dto = await rolled_back(database, run)
    parsed = QuizAnswersCheckOutput.model_validate(checked)
    assert parsed.feedback.pending is True
    assert parsed.feedback.isCorrect is None
    assert parsed.feedback.title == texts.QUIZ_FEEDBACK_SAVED
    assert answer["feedback"] == {"checked": True}
    assert answer["graded_by"] is None
    question = QuizAttemptsGetOutput.model_validate(dto).questions[0]
    assert question.state == "checked"
    assert question.feedback is not None
    assert question.feedback.pending is True


async def test_an_empty_open_answer_is_refused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_attempt(tx.conn, builder=open_payload, brick_type="open_question")
        with pytest.raises(AppError) as error:
            await quiz_service.check_answer(
                assessment_deps(tx),
                actor_for(seed["userId"]),
                seed["attemptId"],
                1,
                {"response": {"text": "   "}, "timeMs": 0},
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "VALIDATION_FAILED"
    assert error.extra["errors"][0]["path"] == "response.text"


async def test_an_unknown_option_is_refused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_attempt(tx.conn, builder=choice_payload, brick_type="choice_question")
        with pytest.raises(AppError) as error:
            await quiz_service.check_answer(
                assessment_deps(tx),
                actor_for(seed["userId"]),
                seed["attemptId"],
                1,
                {"response": {"optionIds": ["zzz"]}, "timeMs": 0},
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "VALIDATION_FAILED"
    assert error.extra["errors"][0]["path"].startswith("response.optionIds")


async def test_a_closed_attempt_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_attempt(
            tx.conn, builder=choice_payload, brick_type="choice_question", status="graded"
        )
        with pytest.raises(AppError) as error:
            await quiz_service.check_answer(
                assessment_deps(tx),
                actor_for(seed["userId"]),
                seed["attemptId"],
                1,
                {"response": {"optionIds": ["a"]}, "timeMs": 0},
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "CONFLICT"
    assert error.status == 409


async def test_another_learner_sees_no_attempt(database: Database) -> None:
    async def run(tx: Any) -> Any:
        seed = await seed_attempt(tx.conn, builder=choice_payload, brick_type="choice_question")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        with pytest.raises(AppError) as read_error:
            await quiz_service.get_attempt(assessment_deps(tx), actor_for(bob), seed["attemptId"])
        with pytest.raises(AppError) as check_error:
            await quiz_service.check_answer(
                assessment_deps(tx),
                actor_for(bob),
                seed["attemptId"],
                1,
                {"response": {"optionIds": ["a"]}, "timeMs": 0},
            )
        return read_error.value, check_error.value

    read_error, check_error = await rolled_back(database, run)
    assert read_error.code == "NOT_FOUND"
    assert check_error.code == "NOT_FOUND"
