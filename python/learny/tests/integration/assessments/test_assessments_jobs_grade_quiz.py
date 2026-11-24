"""[SPEC-2207] The quiz grade job against the local stack.

One submitted attempt holds a code-graded question and one pending open answer: the tutor correction
fills the pending answer, the score and the verdict are computed, the learning result is applied and
`quiz/graded` is queued once. A replayed delivery of `quiz/submitted` corrects nothing twice and
queues no second event.
"""

import json
from collections.abc import Mapping
from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.identity_support import (
    FIXED,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    identifier,
)
from learny.assessments.application.grade_open import OpenGrade, OpenGradeCriterion
from learny.assessments.application.grade_quiz import grade_quiz
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

READ_ATTEMPT = text(
    "select status::text as status, score, passed, per_notion, duration_ms "
    "from public.attempts where id = cast(:attempt as uuid)"
)
READ_ANSWERS = text(
    "select position, is_correct, score, graded_by::text as graded_by, feedback "
    "from public.answers where attempt_id = cast(:attempt as uuid) order by position"
)
EVENTS = text("select event_id from public.event_outbox where name = :name order by event_id")


def choice_document(notion_id: str) -> dict[str, Any]:
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


def open_document(notion_id: str) -> dict[str, Any]:
    return {
        "stem": "Explain why the bank account is debited.",
        "answerMaxChars": 600,
        "expectedElements": ["The receipt increases an asset", "Debit increases an asset"],
        "modelAnswer": "An asset account increases on the debit side.",
        "explanation": "A debit entry increases an asset account.",
        "objective": "Read a double entry",
        "criteria": [
            {"key": "exactness", "label": "Exactness", "points": 1, "description": "The rule is stated."},
        ],
        "sources": [],
    }


async def seed_attempt(conn: Any) -> dict[str, Any]:
    """One learner, one module and one submitted attempt with a pending open answer."""
    user_id = await create_user(conn, "Amelie", timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    module_id = await create_module(conn, formation_id, 1, title="Double entry", status="open")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id)
    items: list[dict[str, Any]] = []
    versions: list[str] = []
    documents = (
        ("choice_question", choice_document(notion_id)),
        ("open_question", open_document(notion_id)),
    )
    for kind, document in documents:
        brick_id = await identifier(
            conn,
            """
            insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
            values (
              cast(:owner as uuid), cast(:formation as uuid), cast(:kind as public.brick_type),
              array[cast(:notion as uuid)], 'validation', 'active'
            )
            returning id::text as id
            """,
            owner=user_id,
            formation=formation_id,
            kind=kind,
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
            payload=json.dumps(document),
        )
        versions.append(version_id)
        items.append(
            {
                "brickId": brick_id,
                "brickVersionId": version_id,
                "points": 50,
                "notionId": notion_id,
                "notionLabel": "Double entry",
                "type": kind,
                "payload": document,
            }
        )
    activity_id = await identifier(
        conn,
        """
        insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
        values (
          cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
          'validation_quiz', cast(:config as jsonb), cast(:items as jsonb), 'ready'
        )
        returning id::text as id
        """,
        user=user_id,
        formation=formation_id,
        module=module_id,
        config=json.dumps({"threshold": 80}),
        items=json.dumps(items),
    )
    attempt_id = await identifier(
        conn,
        """
        insert into public.attempts (user_id, activity_id, attempt_no, status, started_at, submitted_at)
        values (
          cast(:user as uuid), cast(:activity as uuid), 1, 'submitted',
          cast('2026-11-11T12:00:00Z' as timestamptz), cast('2026-11-11T12:10:00Z' as timestamptz)
        )
        returning id::text as id
        """,
        user=user_id,
        activity=activity_id,
    )
    await conn.execute(
        text(
            """
            insert into public.answers (
              attempt_id, brick_version_id, position, response, is_correct, score,
              max_score, graded_by, feedback
            ) values (
              cast(:attempt as uuid), cast(:version as uuid), 1,
              cast(:response as jsonb), true, 50, 50, 'code', cast(:feedback as jsonb)
            )
            """
        ),
        {
            "attempt": attempt_id,
            "version": versions[0],
            "response": json.dumps({"optionIds": ["a"]}),
            "feedback": json.dumps({"checked": True}),
        },
    )
    await conn.execute(
        text(
            """
            insert into public.answers (
              attempt_id, brick_version_id, position, response, is_correct, score,
              max_score, graded_by, feedback
            ) values (
              cast(:attempt as uuid), cast(:version as uuid), 2,
              cast(:response as jsonb), null, null, 50, null, cast(:feedback as jsonb)
            )
            """
        ),
        {
            "attempt": attempt_id,
            "version": versions[1],
            "response": json.dumps({"text": "An asset increases on debit."}),
            "feedback": json.dumps({"checked": True}),
        },
    )
    return {"userId": user_id, "formationId": formation_id, "attemptId": attempt_id}


def grader_of(score: float) -> Any:
    async def grade(context: Mapping[str, Any], item: Mapping[str, Any]) -> OpenGrade:
        del item
        assert context["brickVersionId"]
        return OpenGrade(
            score=score,
            explanation="The rule is right and the vocabulary is precise.",
            criteria=[OpenGradeCriterion(key="exactness", ok=True)],
            missing=[],
            offTopic=False,
        )

    return grade


async def test_the_grade_job_corrects_scores_and_queues_the_event_once(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], Any, list[Any], list[str], dict[str, Any]]:
        fixture = await seed_attempt(tx.conn)
        deps = assessment_deps(tx, now=FIXED)
        outcome = await grade_quiz(deps, fixture["userId"], fixture["attemptId"], grader=grader_of(0.9))
        attempt = (await tx.conn.execute(READ_ATTEMPT, {"attempt": fixture["attemptId"]})).mappings()
        answers = (await tx.conn.execute(READ_ANSWERS, {"attempt": fixture["attemptId"]})).mappings()
        events = (await tx.conn.execute(EVENTS, {"name": "quiz/graded"})).mappings().all()
        return outcome, attempt.all()[0], answers.all(), [str(row["event_id"]) for row in events], fixture

    outcome, attempt, answers, events, fixture = await rolled_back(database, run)

    assert outcome["status"] == "graded"
    assert outcome["score"] == pytest.approx(95.0)
    assert outcome["passed"] is True
    assert attempt["status"] == "graded"
    assert float(attempt["score"]) == pytest.approx(95.0)
    assert answers[1]["graded_by"] == "tutor"
    assert answers[1]["is_correct"] is True
    assert float(answers[1]["score"]) == pytest.approx(45.0)
    feedback = answers[1]["feedback"]
    assert feedback["title"] == texts.GRADE_FEEDBACK_EXACT
    assert feedback["correction"]["kind"] == "open_question"
    assert events == [f"quiz-graded:{fixture['attemptId']}"]


async def test_a_replayed_delivery_corrects_nothing_twice(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], list[Any], list[str]]:
        fixture = await seed_attempt(tx.conn)
        deps = assessment_deps(tx, now=FIXED)
        await grade_quiz(deps, fixture["userId"], fixture["attemptId"], grader=grader_of(0.9))
        replay = await grade_quiz(deps, fixture["userId"], fixture["attemptId"], grader=grader_of(0.1))
        answers = (await tx.conn.execute(READ_ANSWERS, {"attempt": fixture["attemptId"]})).mappings().all()
        events = (await tx.conn.execute(EVENTS, {"name": "quiz/graded"})).mappings().all()
        return replay, answers, [str(row["event_id"]) for row in events]

    replay, answers, events = await rolled_back(database, run)

    assert replay["status"] == "graded"
    assert float(answers[1]["score"]) == pytest.approx(45.0)
    assert len(events) == 1


async def test_an_attempt_that_is_not_submitted_is_refused(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await seed_attempt(tx.conn)
        await tx.conn.execute(
            text("update public.attempts set status = 'in_progress' where id = cast(:attempt as uuid)"),
            {"attempt": fixture["attemptId"]},
        )
        deps = assessment_deps(tx, now=FIXED)

        with pytest.raises(AppError) as refused:
            await grade_quiz(deps, fixture["userId"], fixture["attemptId"], grader=grader_of(0.9))
        assert refused.value.code == "CONFLICT"
        assert refused.value.detail == texts.QUIZ_NOT_SUBMITTED

    await rolled_back(database, run)
