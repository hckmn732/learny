"""[SPEC-2207] The exam deadline job against the local stack (port of `exam-deadline`).

The consumer runs at `deadlineAt + 5 s`; the exam service checks the deadline again, so an early
delivery leaves the attempt running and a delivery after the tolerance grades it once. A duplicated
delivery finds the attempt graded and writes nothing.
"""

import json
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
from learny.assessments.application.exam_deadline import submit_exam_at_deadline
from learny.shared.db.uow import Database
from learny.shared.time import to_iso
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

READ_ATTEMPT = text(
    "select status::text as status, score, passed, deadline_at, submitted_at "
    "from public.attempts where id = cast(:attempt as uuid)"
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


async def seed_exam(conn: Any, *, deadline_at: str) -> dict[str, Any]:
    """One running mock exam of one learner, with one answered choice question."""
    user_id = await create_user(conn, "Alice", timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    module_id = await create_module(conn, formation_id, 1, title="Double entry", status="open")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id)
    document = choice_document(notion_id)
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
        owner=user_id,
        formation=formation_id,
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
    items = [
        {
            "brickId": brick_id,
            "brickVersionId": version_id,
            "points": 100,
            "notionId": notion_id,
            "notionLabel": "Double entry",
            "type": "choice_question",
            "payload": document,
            "studied": True,
        }
    ]
    config = {
        "threshold": 60,
        "durationSec": 2400,
        "questionCount": 1,
        "scoring": "equal",
        "diagnosticPositions": [],
        "modules": [
            {"moduleId": module_id, "position": 1, "label": "Partie", "studied": True},
        ],
    }
    activity_id = await identifier(
        conn,
        """
        insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
        values (
          cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
          'mock_exam', cast(:config as jsonb), cast(:items as jsonb), 'ready'
        )
        returning id::text as id
        """,
        user=user_id,
        formation=formation_id,
        module=module_id,
        config=json.dumps(config),
        items=json.dumps(items),
    )
    attempt_id = await identifier(
        conn,
        """
        insert into public.attempts (
          user_id, activity_id, attempt_no, status, started_at, deadline_at
        ) values (
          cast(:user as uuid), cast(:activity as uuid), 1, 'in_progress',
          cast(:started as timestamptz), cast(:deadline as timestamptz)
        )
        returning id::text as id
        """,
        user=user_id,
        activity=activity_id,
        started=to_iso(FIXED),
        deadline=deadline_at,
    )
    await conn.execute(
        text(
            """
            insert into public.answers (
              attempt_id, brick_version_id, position, response, is_correct, score,
              max_score, graded_by, feedback
            ) values (
              cast(:attempt as uuid), cast(:version as uuid), 1,
              cast(:response as jsonb), null, null, 100, 'code', '{}'::jsonb
            )
            """
        ),
        {
            "attempt": attempt_id,
            "version": version_id,
            "response": json.dumps({"optionIds": ["a"]}),
        },
    )
    return {"userId": user_id, "formationId": formation_id, "attemptId": attempt_id}


async def attempt_of(tx: Any, attempt_id: str) -> Any:
    return (await tx.conn.execute(READ_ATTEMPT, {"attempt": attempt_id})).mappings().all()[0]


async def test_an_early_delivery_leaves_the_attempt_running(database: Database) -> None:
    async def run(tx: Any) -> Any:
        deadline = "2026-11-11T12:19:59.000Z"
        fixture = await seed_exam(tx.conn, deadline_at=deadline)
        deps = assessment_deps(tx, now=FIXED)

        outcome = await submit_exam_at_deadline(deps, fixture["userId"], fixture["attemptId"])

        assert outcome["status"] == "in_progress"
        attempt = await attempt_of(tx, fixture["attemptId"])
        assert attempt["status"] == "in_progress"
        assert (await tx.conn.execute(EVENTS, {"name": "exam/submitted"})).mappings().all() == []

    await rolled_back(database, run)


async def test_a_deadline_delivery_grades_the_attempt_once(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], Any, list[str], dict[str, Any], str]:
        deadline = "2026-11-11T12:19:54.000Z"
        fixture = await seed_exam(tx.conn, deadline_at=deadline)
        deps = assessment_deps(tx, now=FIXED)

        outcome = await submit_exam_at_deadline(deps, fixture["userId"], fixture["attemptId"])
        attempt = await attempt_of(tx, fixture["attemptId"])
        events = [
            str(row["event_id"])
            for row in (await tx.conn.execute(EVENTS, {"name": "exam/submitted"})).mappings().all()
        ]
        replay = await submit_exam_at_deadline(deps, fixture["userId"], fixture["attemptId"])
        return outcome, attempt, events, replay, fixture["attemptId"]

    outcome, attempt, events, replay, attempt_id = await rolled_back(database, run)

    assert outcome["status"] == "graded"
    assert attempt["status"] == "graded"
    assert attempt["score"] is not None
    assert events == [f"exam-submitted:{attempt_id}"]
    assert replay["status"] == "graded"
    assert attempt["submitted_at"] is not None
