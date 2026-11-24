"""[SPEC-2202] Offline synchronisation of queued answers (SPEC-801 ET-6 to ET-8, ADR-0200).

The server regrades the answer with the brick code, applies FSRS with the response instant, writes
one receipt per `clientId` and answers one result per entry: a replay is a `duplicate`, an answer
older than the local day is `EXPIRED`, a session of another learner is `FORBIDDEN` and a position
already answered is a `conflict`.
"""

import json
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
    create_notion_state,
    create_user,
    identifier,
    one,
)
from factories.learning_deps import learning_deps
from learny.assessments.application import offline_sync as service
from learny.learning.application import review as review_service
from learny.shared.db.uow import Database
from learny_api.generated.models import OfflineSyncOutput

pytestmark = pytest.mark.spec("SPEC-2202")

CLIENT_ONE = "11111111-1111-4111-8111-111111111111"
CLIENT_TWO = "22222222-2222-4222-8222-222222222222"
CLIENT_THREE = "33333333-3333-4333-8333-333333333333"
ANSWERED_AT = "2026-11-11T12:10:00.000Z"


async def seed_session(tx: Any, user_id: str) -> dict[str, Any]:
    """One review session of the day with its recall card, through the real use case."""
    conn = tx.conn
    formation_id = await create_formation(conn, user_id, title="SAP")
    module_id = await create_module(conn, formation_id, 1, title="Ledgers", status="validated")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id)
    await create_notion_state(conn, user_id, notion_id, due_at=FIXED, in_review=True)
    brick_id = await identifier(
        conn,
        """
        insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
        values (
          cast(:user as uuid), cast(:formation as uuid), 'recall_card',
          array[cast(:notion as uuid)], 'review', 'active'
        )
        returning id::text as id
        """,
        user=user_id,
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
        payload=json.dumps(
            {
                "front": "What is the double-entry principle?",
                "back": "Each transaction is recorded on the debit side of one account and the "
                "credit side of another, for the same amount.",
                "sources": [],
            }
        ),
    )
    session = await review_service.get_or_create_today_session(
        learning_deps(tx), actor_for(user_id), formation_id, "full"
    )
    return {
        "userId": user_id,
        "formationId": formation_id,
        "notionId": notion_id,
        "versionId": version_id,
        "sessionId": session["sessionId"],
        "attemptId": session["attemptId"],
    }


def answer_entry(seed: dict[str, Any], client_id: str, *, answered_at: str = ANSWERED_AT) -> dict[str, Any]:
    """One queued recall-card answer of the seeded session."""
    return {
        "clientId": client_id,
        "kind": "answer",
        "formationId": seed["formationId"],
        "sessionId": seed["sessionId"],
        "answeredAt": answered_at,
        "position": 0,
        "brickVersionId": seed["versionId"],
        "response": {"selfGrade": "good"},
        "timeMs": 4200,
    }


def complete_entry(seed: dict[str, Any], client_id: str) -> dict[str, Any]:
    """The completion of the seeded session."""
    return {
        "clientId": client_id,
        "kind": "complete",
        "formationId": seed["formationId"],
        "sessionId": seed["sessionId"],
        "answeredAt": ANSWERED_AT,
    }


async def test_a_queued_answer_is_regraded_stored_and_journalled(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx, alice)
        result = await service.sync_offline_answers(
            assessment_deps(tx), actor_for(alice), [answer_entry(seed, CLIENT_ONE)]
        )
        answer = await one(
            tx.conn,
            """
            select a.position, a.is_correct, a.score::text as score, a.max_score::text as max_score,
                   a.time_ms, a.graded_by::text as graded_by, a.feedback
              from public.answers a
             where a.attempt_id = cast(:attempt as uuid) and a.position = 1
            """,
            attempt=seed["attemptId"],
        )
        receipt = await one(
            tx.conn,
            """
            select status, answer_id::text as answer_id
              from public.offline_sync_receipts
             where user_id = cast(:user as uuid) and client_id = cast(:client as uuid)
            """,
            user=alice,
            client=CLIENT_ONE,
        )
        logs = await count(
            tx.conn,
            "select count(*)::int as count from public.review_logs where user_id = cast(:u as uuid)",
            u=alice,
        )
        activity = await one(
            tx.conn,
            """
            select qualifying, minutes, sources
              from public.daily_activity
             where user_id = cast(:u as uuid) and day = cast('2026-11-11' as date)
            """,
            u=alice,
        )
        return result, answer, receipt, logs, activity

    result, answer, receipt, logs, activity = await rolled_back(database, run)
    parsed = OfflineSyncOutput.model_validate(result)
    assert len(parsed.results) == 1
    assert parsed.results[0].status == "applied"
    assert parsed.results[0].correct is True
    assert parsed.results[0].nextDueAt is not None
    assert answer["position"] == 1
    assert answer["is_correct"] is True
    assert answer["graded_by"] == "code"
    assert answer["feedback"]["offline"] is True
    assert answer["feedback"]["clientAnswerId"] == CLIENT_ONE
    assert receipt["status"] == "applied"
    assert receipt["answer_id"] is not None
    assert logs == 1
    assert activity["qualifying"] is True
    assert activity["minutes"] == 1
    assert f"offline:{CLIENT_ONE}" in activity["sources"]


async def test_a_replayed_entry_is_a_duplicate_with_one_answer(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx, alice)
        first = await service.sync_offline_answers(
            assessment_deps(tx), actor_for(alice), [answer_entry(seed, CLIENT_ONE)]
        )
        second = await service.sync_offline_answers(
            assessment_deps(tx), actor_for(alice), [answer_entry(seed, CLIENT_ONE)]
        )
        answers = await count(
            tx.conn,
            "select count(*)::int as count from public.answers where attempt_id = cast(:a as uuid)",
            a=seed["attemptId"],
        )
        receipts = await count(
            tx.conn,
            "select count(*)::int as count from public.offline_sync_receipts "
            "where user_id = cast(:u as uuid)",
            u=alice,
        )
        return first, second, answers, receipts

    first, second, answers, receipts = await rolled_back(database, run)
    assert first["results"][0]["status"] == "applied"
    assert second["results"][0]["status"] == "duplicate"
    assert answers == 1
    assert receipts == 1


async def test_an_expired_answer_is_rejected_with_a_receipt(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx, alice)
        result = await service.sync_offline_answers(
            assessment_deps(tx),
            actor_for(alice),
            [answer_entry(seed, CLIENT_ONE, answered_at="2026-11-01T10:00:00.000Z")],
        )
        receipt = await one(
            tx.conn,
            """
            select status from public.offline_sync_receipts
             where user_id = cast(:user as uuid) and client_id = cast(:client as uuid)
            """,
            user=alice,
            client=CLIENT_ONE,
        )
        return result, receipt

    result, receipt = await rolled_back(database, run)
    parsed = OfflineSyncOutput.model_validate(result)
    assert parsed.results[0].status == "rejected"
    assert parsed.results[0].code == "EXPIRED"
    assert receipt["status"] == "rejected"


async def test_a_session_of_another_learner_is_forbidden(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        seed = await seed_session(tx, alice)
        entry = {**answer_entry(seed, CLIENT_ONE), "userId": bob}
        result = await service.sync_offline_answers(assessment_deps(tx), actor_for(bob), [entry])
        answers = await count(
            tx.conn,
            "select count(*)::int as count from public.answers where attempt_id = cast(:a as uuid)",
            a=seed["attemptId"],
        )
        return result, answers

    result, answers = await rolled_back(database, run)
    parsed = OfflineSyncOutput.model_validate(result)
    assert parsed.results[0].status == "rejected"
    assert parsed.results[0].code == "FORBIDDEN"
    assert answers == 0


async def test_a_second_answer_at_the_same_position_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx, alice)
        await service.sync_offline_answers(
            assessment_deps(tx), actor_for(alice), [answer_entry(seed, CLIENT_ONE)]
        )
        result = await service.sync_offline_answers(
            assessment_deps(tx),
            actor_for(alice),
            [answer_entry(seed, CLIENT_TWO, answered_at="2026-11-11T12:11:00.000Z")],
        )
        answers = await count(
            tx.conn,
            "select count(*)::int as count from public.answers where attempt_id = cast(:a as uuid)",
            a=seed["attemptId"],
        )
        return result, answers

    result, answers = await rolled_back(database, run)
    parsed = OfflineSyncOutput.model_validate(result)
    assert parsed.results[0].status == "conflict"
    assert answers == 1


async def test_a_complete_entry_closes_the_session(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx, alice)
        result = await service.sync_offline_answers(
            assessment_deps(tx), actor_for(alice), [complete_entry(seed, CLIENT_THREE)]
        )
        attempt = await one(
            tx.conn,
            "select status::text as status, review_feedback from public.attempts where id = cast(:a as uuid)",
            a=seed["attemptId"],
        )
        return result, attempt

    result, attempt = await rolled_back(database, run)
    parsed = OfflineSyncOutput.model_validate(result)
    assert parsed.results[0].status == "applied"
    assert attempt["status"] == "graded"
    assert attempt["review_feedback"]["summary"]["reviewedCount"] >= 1


async def test_entries_are_applied_in_answered_at_order(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx, alice)
        return await service.sync_offline_answers(
            assessment_deps(tx),
            actor_for(alice),
            [
                answer_entry(seed, CLIENT_TWO, answered_at="2026-11-11T12:11:00.000Z"),
                answer_entry(seed, CLIENT_ONE, answered_at="2026-11-11T12:10:00.000Z"),
            ],
        )

    result = await rolled_back(database, run)
    parsed = OfflineSyncOutput.model_validate(result)
    assert [entry.clientId for entry in parsed.results] == [CLIENT_ONE, CLIENT_TWO]
    assert [entry.status for entry in parsed.results] == ["applied", "conflict"]
