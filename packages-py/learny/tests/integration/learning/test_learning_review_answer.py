"""[SPEC-2202] Answer and closure of the daily global quiz (SPEC-701 ET-3, ET-4, ET-5).

One answer updates the FSRS journal of its notions in the answer transaction, is idempotent by
`clientAnswerId`, refuses a second answer at the same position and writes no FSRS update for a
skipped item. The closure grades the attempt, qualifies the day and stores its summary.
"""

import json
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    FIXED,
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_notion_state,
    create_user,
)
from factories.learning_deps import learning_deps
from learny.learning.application import review as review_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import ReviewAnswerOutput, ReviewCompleteOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


async def seed_session(conn: Any, user_id: str, *, brick_type: str = "recall_card") -> dict[str, Any]:
    """One active formation with a due notion, its brick and the session of the day."""
    formation_id = await create_formation(conn, user_id, title="SAP")
    module_id = await create_module(conn, formation_id, 1, title="Reseaux", status="validated")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id)
    await create_notion_state(conn, user_id, notion_id, due_at=FIXED, in_review=True)
    brick_id = (
        (
            await conn.execute(
                text(
                    """
                    insert into public.bricks (
                      owner_id, formation_id, type, notion_ids, purpose, status
                    ) values (
                      cast(:user as uuid), cast(:formation as uuid), cast(:type as public.brick_type),
                      array[cast(:notion as uuid)], 'review', 'active'
                    )
                    returning id::text as id
                    """
                ),
                {
                    "user": user_id,
                    "formation": formation_id,
                    "notion": notion_id,
                    "type": brick_type,
                },
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    payload = {
        "front": "What is the double-entry principle?",
        "back": (
            "Each transaction is recorded on the debit side of one account "
            "and the credit side of another, for the same amount."
        ),
        "sources": [],
    }
    version_id = (
        (
            await conn.execute(
                text(
                    """
                    insert into public.brick_versions (brick_id, version, payload, origin, created_by)
                    values (cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor')
                    returning id::text as id
                    """
                ),
                {"brick": brick_id, "payload": json.dumps(payload)},
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    return {
        "formationId": formation_id,
        "notionId": notion_id,
        "brickId": brick_id,
        "versionId": version_id,
    }


async def open_session(tx: Any, user_id: str, formation_id: str) -> dict[str, Any]:
    return await review_service.get_or_create_today_session(
        learning_deps(tx), actor_for(user_id), formation_id, "full"
    )


async def test_an_answer_updates_the_fsrs_journal_and_replays(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx.conn, alice)
        session = await open_session(tx, alice, seed["formationId"])
        body = {
            "position": 0,
            "clientAnswerId": "11111111-1111-4111-8111-111111111111",
            "timeMs": 4200,
            "response": {"selfRating": "good"},
        }
        first = await review_service.answer_review_item(
            learning_deps(tx), actor_for(alice), session["sessionId"], body
        )
        second = await review_service.answer_review_item(
            learning_deps(tx), actor_for(alice), session["sessionId"], body
        )
        counts = (
            (
                await tx.conn.execute(
                    text(
                        """
                    select
                      (
                        select count(*)::int from public.answers
                         where attempt_id = cast(:a as uuid)
                      ) as answers,
                      (
                        select count(*)::int from public.review_logs
                         where user_id = cast(:u as uuid)
                      ) as logs
                    """
                    ),
                    {"a": session["attemptId"], "u": alice},
                )
            )
            .mappings()
            .one()
        )
        state = (
            (
                await tx.conn.execute(
                    text(
                        """
                    select success_count, in_review, mastery::text as mastery
                      from public.notion_states
                     where user_id = cast(:u as uuid) and notion_id = cast(:n as uuid)
                    """
                    ),
                    {"u": alice, "n": seed["notionId"]},
                )
            )
            .mappings()
            .one()
        )
        return first, second, dict(counts), dict(state)

    first, second, counts, state = await rolled_back(database, run)
    parsed = ReviewAnswerOutput.model_validate(first)
    assert parsed.position == 0
    assert parsed.skipped is False
    assert parsed.isCorrect is True
    assert parsed.notions[0].rating == "good"
    assert parsed.notions[0].nextDueAt is not None
    assert ReviewAnswerOutput.model_validate(second).model_dump() == parsed.model_dump()
    assert counts["answers"] == 1
    assert counts["logs"] == 1
    assert state["success_count"] == 1
    assert state["in_review"] is True


async def test_a_second_answer_at_the_same_position_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> str:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx.conn, alice)
        session = await open_session(tx, alice, seed["formationId"])
        await review_service.answer_review_item(
            learning_deps(tx),
            actor_for(alice),
            session["sessionId"],
            {
                "position": 0,
                "clientAnswerId": "22222222-2222-4222-8222-222222222222",
                "timeMs": 1000,
                "response": {"selfRating": "good"},
            },
        )
        try:
            await review_service.answer_review_item(
                learning_deps(tx),
                actor_for(alice),
                session["sessionId"],
                {
                    "position": 0,
                    "clientAnswerId": "33333333-3333-4333-8333-333333333333",
                    "timeMs": 1000,
                    "response": {"selfRating": "good"},
                },
            )
        except AppError as error:
            return error.code
        return "OK"

    assert await rolled_back(database, run) == "CONFLICT"


async def test_a_skipped_item_writes_no_fsrs_update(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx.conn, alice)
        session = await open_session(tx, alice, seed["formationId"])
        dto = await review_service.answer_review_item(
            learning_deps(tx),
            actor_for(alice),
            session["sessionId"],
            {
                "position": 0,
                "clientAnswerId": "44444444-4444-4444-8444-444444444444",
                "timeMs": 0,
                "skipped": True,
            },
        )
        logs = (
            (
                await tx.conn.execute(
                    text(
                        "select count(*)::int as total from public.review_logs"
                        " where user_id = cast(:u as uuid)"
                    ),
                    {"u": alice},
                )
            )
            .mappings()
            .one()["total"]
        )
        return dto, logs

    dto, logs = await rolled_back(database, run)
    parsed = ReviewAnswerOutput.model_validate(dto)
    assert parsed.skipped is True
    assert parsed.isCorrect is None
    assert parsed.correction is None
    assert parsed.notions == []
    assert logs == 0


async def test_a_tutor_graded_brick_cannot_be_applied(database: Database) -> None:
    async def run(tx: Any) -> str:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx.conn, alice)
        session = await open_session(tx, alice, seed["formationId"])
        await tx.conn.execute(
            text("update public.bricks set type = 'open_question' where id = cast(:b as uuid)"),
            {"b": seed["brickId"]},
        )
        try:
            await review_service.answer_review_item(
                learning_deps(tx),
                actor_for(alice),
                session["sessionId"],
                {
                    "position": 0,
                    "clientAnswerId": "55555555-5555-4555-8555-555555555555",
                    "timeMs": 1000,
                    "response": {"text": "un maillage"},
                },
            )
        except AppError as error:
            return error.code
        return "OK"

    assert await rolled_back(database, run) == "RESPONSE_INVALID"


async def test_completing_the_session_grades_it_and_stores_its_summary(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx.conn, alice)
        session = await open_session(tx, alice, seed["formationId"])
        await review_service.answer_review_item(
            learning_deps(tx),
            actor_for(alice),
            session["sessionId"],
            {
                "position": 0,
                "clientAnswerId": "66666666-6666-4666-8666-666666666666",
                "timeMs": 2000,
                "response": {"selfRating": "good"},
            },
        )
        summary = await review_service.complete_review_session(
            learning_deps(tx), actor_for(alice), session["sessionId"]
        )
        replay = await review_service.complete_review_session(
            learning_deps(tx), actor_for(alice), session["sessionId"]
        )
        attempt = (
            (
                await tx.conn.execute(
                    text(
                        """
                    select status, review_feedback
                      from public.attempts where id = cast(:a as uuid)
                    """
                    ),
                    {"a": session["attemptId"]},
                )
            )
            .mappings()
            .one()
        )
        activity = (
            (
                await tx.conn.execute(
                    text(
                        """
                    select minutes, qualifying from public.daily_activity
                     where user_id = cast(:u as uuid) and day = cast('2026-11-11' as date)
                    """
                    ),
                    {"u": alice},
                )
            )
            .mappings()
            .one()
        )
        streak = (
            (
                await tx.conn.execute(
                    text("select streak_days from public.profiles where id = cast(:u as uuid)"),
                    {"u": alice},
                )
            )
            .mappings()
            .one()["streak_days"]
        )
        return summary, replay, dict(attempt), dict(activity), streak

    summary, replay, attempt, activity, streak = await rolled_back(database, run)
    parsed = ReviewCompleteOutput.model_validate(summary)
    assert parsed.reviewedCount == 1
    assert parsed.okCount == 1
    assert parsed.soonCount == 0
    assert parsed.minutes >= 1
    assert parsed.streakDays == 1
    assert ReviewCompleteOutput.model_validate(replay).model_dump() == parsed.model_dump()
    assert attempt["status"] == "graded"
    feedback = attempt["review_feedback"]
    if isinstance(feedback, str):
        feedback = json.loads(feedback)
    assert feedback["summary"]["reviewedCount"] == 1
    assert activity["qualifying"] is True
    assert activity["minutes"] >= 1
    assert streak == 1


async def test_completing_a_closed_session_without_summary_is_refused(database: Database) -> None:
    async def run(tx: Any) -> str:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_session(tx.conn, alice)
        session = await open_session(tx, alice, seed["formationId"])
        await tx.conn.execute(
            text("update public.attempts set status = 'graded' where id = cast(:a as uuid)"),
            {"a": session["attemptId"]},
        )
        try:
            await review_service.complete_review_session(
                learning_deps(tx), actor_for(alice), session["sessionId"]
            )
        except AppError as error:
            return f"{error.code}:{error.status}"
        return "OK"

    assert await rolled_back(database, run) == "SESSION_CLOSED:422"
