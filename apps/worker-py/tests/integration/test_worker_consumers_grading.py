"""[SPEC-2207] Notation and unlock consumed by the real worker: one graded attempt, one unlock.

`quiz/submitted` reaches `assessments.grade_quiz`, which corrects the attempt, applies the learning
result and queues `quiz/graded` once. `quiz/graded` reaches `formation.unlock_module`, which
validates the module and opens the next one once. Both tests replay the same event: the second
delivery runs nothing.
"""

import json
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    identifier,
)
from learny.shared.db.uow import Database, Tx
from sqlalchemy import text
from support.jobs import count, delivery, emit_event, event_ids, harness

pytestmark = pytest.mark.spec("SPEC-2207")

READ_ATTEMPT = text(
    "select status::text as status, score, passed from public.attempts where id = cast(:attempt as uuid)"
)
MODULE_STATUS = text(
    "select coalesce(mp.status::text, 'none') as status "
    "from public.modules m left join public.module_progress mp "
    "on mp.module_id = m.id and mp.user_id = cast(:user as uuid) "
    "where m.id = cast(:module as uuid)"
)


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


async def seed_learner(tx: Tx, first_name: str) -> dict[str, str]:
    user = await create_user(tx.conn, first_name, timezone="Europe/Paris")
    formation = await create_formation(tx.conn, user, title="Accounting")
    module = await create_module(tx.conn, formation, 1, title="Double entry", status="open")
    chapter = await create_chapter(tx.conn, formation, module)
    notion = await create_notion(tx.conn, formation, module, chapter)
    return {"user": user, "formation": formation, "module": module, "notion": notion}


async def seed_submitted_attempt(tx: Tx) -> dict[str, str]:
    seed = await seed_learner(tx, "Hugo")
    document = choice_document(seed["notion"])
    brick = await identifier(
        tx.conn,
        """
        insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
        values (
          cast(:owner as uuid), cast(:formation as uuid), 'choice_question',
          array[cast(:notion as uuid)], 'validation', 'active'
        )
        returning id::text as id
        """,
        owner=seed["user"],
        formation=seed["formation"],
        notion=seed["notion"],
    )
    version = await identifier(
        tx.conn,
        """
        insert into public.brick_versions (brick_id, version, payload, origin, created_by)
        values (cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor')
        returning id::text as id
        """,
        brick=brick,
        payload=json.dumps(document),
    )
    items = [
        {
            "brickId": brick,
            "brickVersionId": version,
            "points": 50,
            "notionId": seed["notion"],
            "notionLabel": "Double entry",
            "type": "choice_question",
            "payload": document,
        }
    ]
    activity = await identifier(
        tx.conn,
        """
        insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
        values (
          cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid), 'validation_quiz',
          cast(:config as jsonb), cast(:items as jsonb), 'ready'
        )
        returning id::text as id
        """,
        user=seed["user"],
        formation=seed["formation"],
        module=seed["module"],
        config=json.dumps({"threshold": 80}),
        items=json.dumps([{**items[0], "payload": document}]),
    )
    attempt = await identifier(
        tx.conn,
        """
        insert into public.attempts (user_id, activity_id, attempt_no, status, started_at, submitted_at)
        values (
          cast(:user as uuid), cast(:activity as uuid), 1, 'submitted',
          cast('2026-11-11T12:00:00Z' as timestamptz), cast('2026-11-11T12:10:00Z' as timestamptz)
        )
        returning id::text as id
        """,
        user=seed["user"],
        activity=activity,
    )
    await tx.conn.execute(
        text(
            """
            insert into public.answers (
              attempt_id, brick_version_id, position, response, is_correct, score,
              max_score, graded_by, feedback
            ) values (
              cast(:attempt as uuid), cast(:version as uuid), 1, cast(:response as jsonb),
              true, 50, 50, 'code', cast(:feedback as jsonb)
            )
            """
        ),
        {
            "attempt": attempt,
            "version": version,
            "response": json.dumps({"optionIds": ["a"]}),
            "feedback": json.dumps({"checked": True}),
        },
    )
    return {**seed, "attempt": attempt}


async def test_a_submitted_quiz_is_graded_once(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        seed = await seed_submitted_attempt(tx)
        event_id = await emit_event(
            tx,
            "quiz/submitted",
            {
                "userId": seed["user"],
                "formationId": seed["formation"],
                "attemptId": seed["attempt"],
                "activityId": "ignored",
                "moduleId": seed["module"],
                "openCount": 0,
            },
            f"quiz-submitted:{seed['attempt']}",
        )
        worker = harness(tx, ("assessments.grade_quiz",))

        first = await worker.drain()
        attempt = dict((await tx.conn.execute(READ_ATTEMPT, {"attempt": seed["attempt"]})).mappings().one())
        state = await delivery(tx, event_id, "assessments.grade_quiz")
        graded = await event_ids(tx, f"quiz-graded:{seed['attempt']}")

        second = await worker.drain()
        graded_after = await event_ids(tx, f"quiz-graded:{seed['attempt']}")
        attempt_after = dict(
            (await tx.conn.execute(READ_ATTEMPT, {"attempt": seed["attempt"]})).mappings().one()
        )
        return {
            "first": first,
            "attempt": attempt,
            "attempt_id": seed["attempt"],
            "state": state,
            "graded": graded,
            "second": second,
            "graded_after": graded_after,
            "attempt_after": attempt_after,
        }

    result = await rolled_back(database, run)

    assert result["first"][1] == 1
    assert result["attempt"]["status"] == "graded"
    assert float(result["attempt"]["score"]) == pytest.approx(100.0)
    assert result["attempt"]["passed"] is True
    assert result["state"] is not None
    assert result["state"]["status"] == "done"
    assert result["graded"] == [f"quiz-graded:{result['attempt_id']}"]
    assert result["second"][1] == 0
    assert result["graded_after"] == result["graded"]
    assert result["attempt_after"] == result["attempt"]


async def test_a_graded_quiz_unlocks_the_next_module_once(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        seed = await seed_learner(tx, "Ines")
        await create_module(tx.conn, seed["formation"], 2, title="Closing", status="locked")
        event_id = await emit_event(
            tx,
            "quiz/graded",
            {
                "userId": seed["user"],
                "formationId": seed["formation"],
                "moduleId": seed["module"],
                "attemptId": "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
                "score": 92.5,
                "passed": True,
                "threshold": 80,
                "attemptNo": 1,
            },
            "spec-2207:quiz-graded",
        )
        worker = harness(tx, ("formation.unlock_module",))

        first = await worker.drain()
        status = (
            await tx.conn.execute(MODULE_STATUS, {"user": seed["user"], "module": seed["module"]})
        ).scalar_one()
        state = await delivery(tx, event_id, "formation.unlock_module")
        validated = await event_ids(tx, f"module-validated:{seed['module']}")
        notifications = await count(
            tx,
            "select count(*)::int from public.notifications where user_id = cast(:user as uuid)",
            user=seed["user"],
        )

        second = await worker.drain()
        validated_after = await event_ids(tx, f"module-validated:{seed['module']}")
        return {
            "first": first,
            "status": status,
            "state": state,
            "validated": validated,
            "notifications": notifications,
            "second": second,
            "validated_after": validated_after,
        }

    result = await rolled_back(database, run)

    assert result["first"][1] == 1
    assert result["status"] == "validated"
    assert result["state"] is not None
    assert result["state"]["status"] == "done"
    assert len(result["validated"]) == 1
    assert result["notifications"] >= 1
    assert result["second"][1] == 0
    assert result["validated_after"] == result["validated"]
