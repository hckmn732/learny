"""[SPEC-2202] Application of one corrected answer to the learning state (SPEC-411 ET-1, ET-4).

The pure planner runs the FSRS grade, mastery and gap lifecycle in answer order; the persistence
step writes the state row and the journal through the security-definer functions, so a replay
writes nothing. Nothing here reads the clock.
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
from learny.learning.application import apply_result
from learny.shared.db.uow import Database
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")

ANSWER_AT = "2026-11-11T12:20:00.000Z"


def review_answer(**overrides: Any) -> dict[str, Any]:
    """One `NotionReviewAnswer` as the planner takes it."""
    answer = {
        "answerId": "11111111-1111-4111-8111-111111111111",
        "attemptId": "22222222-2222-4222-8222-222222222222",
        "attemptKind": "global_quiz_session",
        "attemptNo": 1,
        "source": "global_quiz",
        "notionId": "33333333-3333-4333-8333-333333333333",
        "format": "recall_card",
        "correct": True,
        "selfRating": "good",
        "timeMs": 3000.0,
        "answeredAt": ANSWER_AT,
        "chosenDistractorNotionId": None,
        "confusedWithNotionId": None,
        "normalizedResponse": None,
        "offTopic": False,
        "countsForGaps": True,
    }
    answer.update(overrides)
    return answer


def fresh_state() -> dict[str, Any]:
    """The state of a notion that has never been reviewed."""
    return {
        "fsrs": None,
        "mastery": 0.0,
        "firstSeenAt": None,
        "lastSeenAt": None,
        "successCount": 0,
        "gap": None,
        "inReview": False,
    }


def test_the_planner_runs_the_fsrs_grade_and_the_mastery() -> None:
    steps = apply_result.plan_notion_reviews(
        notion_id="33333333-3333-4333-8333-333333333333",
        state=fresh_state(),
        answers=[review_answer()],
        history={"mastery": [], "gapAnswers": [], "timed": []},
    )
    assert len(steps) == 1
    step = steps[0]
    assert step["rating"] == "good"
    assert step["correct"] is True
    assert step["successCountAfter"] == 1
    # The mastery is the weighted history *before* the current answer (SPEC-401 ET-3).
    assert step["masteryAfter"] == 0.0
    # `enableShortTerm`: a good answer on a brand-new card stays in the learning steps.
    assert step["cardAfter"]["state"] == "learning"
    assert step["dueAt"] > ANSWER_AT
    assert step["gapEvent"] is None
    assert step["firstSeenAt"] == ANSWER_AT


def test_the_planner_grades_an_incorrect_answer_again() -> None:
    steps = apply_result.plan_notion_reviews(
        notion_id="33333333-3333-4333-8333-333333333333",
        state=fresh_state(),
        answers=[review_answer(correct=False, selfRating=None, format="choice_question")],
        history={"mastery": [], "gapAnswers": [], "timed": []},
    )
    assert len(steps) == 1
    assert steps[0]["rating"] == "again"
    assert steps[0]["successCountAfter"] == 0


async def seed_notion(conn: Any, user_id: str) -> dict[str, Any]:
    """One validated formation with a due notion, its brick and a graded attempt."""
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
                      cast(:user as uuid), cast(:formation as uuid), 'recall_card',
                      array[cast(:notion as uuid)], 'review', 'active'
                    )
                    returning id::text as id
                    """
                ),
                {"user": user_id, "formation": formation_id, "notion": notion_id},
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    version_id = (
        (
            await conn.execute(
                text(
                    """
                    insert into public.brick_versions (brick_id, version, payload, origin, created_by)
                    values (
                      cast(:brick as uuid), 1,
                      cast(:payload as jsonb), 'tutor', 'tutor'
                    )
                    returning id::text as id
                    """
                ),
                {
                    "brick": brick_id,
                    "payload": json.dumps(
                        {
                            "front": "What is the double-entry principle?",
                            "back": (
                                "Each transaction is recorded on the debit side of one account "
                                "and the credit side of another, for the same amount."
                            ),
                            "sources": [],
                        }
                    ),
                },
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    activity_id = (
        (
            await conn.execute(
                text(
                    """
                    insert into public.activities (
                      owner_id, formation_id, module_id, kind, config, items, status, for_date
                    ) values (
                      cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
                      'global_quiz_session', cast('{}' as jsonb),
                      cast(:items as jsonb), 'ready', cast('2026-11-11' as date)
                    )
                    returning id::text as id
                    """
                ),
                {
                    "user": user_id,
                    "formation": formation_id,
                    "module": module_id,
                    "items": json.dumps([{"brickId": brick_id, "brickVersionId": version_id}]),
                },
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    attempt_id = (
        (
            await conn.execute(
                text(
                    """
                    insert into public.attempts (user_id, activity_id, attempt_no, status)
                    values (cast(:user as uuid), cast(:activity as uuid), 1, 'in_progress')
                    returning id::text as id
                    """
                ),
                {"user": user_id, "activity": activity_id},
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    return {
        "formationId": formation_id,
        "notionId": notion_id,
        "versionId": version_id,
        "attemptId": attempt_id,
    }


async def seed_answer(
    conn: Any, seed: dict[str, Any], answer_id: str, *, position: int, correct: bool
) -> None:
    """The answer row a review log points at (the journal has a foreign key on it)."""
    await conn.execute(
        text(
            """
            insert into public.answers (
              id, attempt_id, brick_version_id, position, response, is_correct, time_ms
            ) values (
              cast(:answer as uuid), cast(:attempt as uuid), cast(:version as uuid), :position,
              cast(:response as jsonb), :correct, 1000
            )
            """
        ),
        {
            "answer": answer_id,
            "attempt": seed["attemptId"],
            "version": seed["versionId"],
            "position": position,
            "response": json.dumps({"selfGrade": "good"}),
            "correct": correct,
        },
    )


async def test_persisting_a_step_is_idempotent(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_notion(tx.conn, alice)
        await seed_answer(
            tx.conn,
            seed,
            "11111111-1111-4111-8111-111111111111",
            position=1,
            correct=True,
        )
        async with learning_deps(tx).db.user_tx(actor_for(alice)) as utx:
            states = await apply_result.load_states(utx, alice, [seed["notionId"]])
            steps = apply_result.plan_notion_reviews(
                notion_id=seed["notionId"],
                state=apply_result.previous_state_of(states[seed["notionId"]]),
                answers=[review_answer(notionId=seed["notionId"])],
                history={"mastery": [], "gapAnswers": [], "timed": []},
            )
            first = await apply_result.persist_step(utx, alice, steps[0])
            second = await apply_result.persist_step(utx, alice, steps[0])
        counts = (
            (
                await tx.conn.execute(
                    text(
                        """
                    select
                      (
                        select count(*)::int from public.review_logs
                         where user_id = cast(:u as uuid)
                      ) as logs,
                      (
                        select count(*)::int from public.notion_states
                         where user_id = cast(:u as uuid)
                      ) as states
                    """
                    ),
                    {"u": alice},
                )
            )
            .mappings()
            .one()
        )
        return first, second, dict(counts)

    first, second, counts = await rolled_back(database, run)
    assert first is True
    assert second is False
    assert counts["logs"] == 1
    assert counts["states"] == 1


async def test_a_newer_review_blocks_an_older_synchronised_answer(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_notion(tx.conn, alice)
        await seed_answer(
            tx.conn,
            seed,
            "44444444-4444-4444-8444-444444444444",
            position=1,
            correct=True,
        )
        async with learning_deps(tx).db.user_tx(actor_for(alice)) as utx:
            applied = await apply_result.apply_review_result(
                utx,
                user_id=alice,
                notion_id=seed["notionId"],
                source="global_quiz",
                format_name="recall_card",
                correct=True,
                rating="good",
                time_ms=1000,
                answer_id="44444444-4444-4444-8444-444444444444",
                attempt_id="55555555-5555-4555-8555-555555555555",
                attempt_no=1,
                reviewed_at=ANSWER_AT,
            )
            older = await apply_result.apply_review_result(
                utx,
                user_id=alice,
                notion_id=seed["notionId"],
                source="global_quiz",
                format_name="recall_card",
                correct=False,
                rating="again",
                time_ms=1000,
                answer_id="66666666-6666-4666-8666-666666666666",
                attempt_id="55555555-5555-4555-8555-555555555555",
                attempt_no=1,
                reviewed_at="2026-11-10T12:20:00.000Z",
                skip_fsrs_if_newer=True,
            )
        logs = (
            (
                await tx.conn.execute(
                    text("select count(*)::int from public.review_logs where user_id = cast(:u as uuid)"),
                    {"u": alice},
                )
            )
            .mappings()
            .one()["count"]
        )
        return applied, older, logs

    applied, older, logs = await rolled_back(database, run)
    assert applied is not None
    assert applied["rating"] == "good"
    assert older is None
    assert logs == 1


async def test_an_again_answer_lapses_the_stored_card(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_notion(tx.conn, alice)
        await seed_answer(
            tx.conn,
            seed,
            "77777777-7777-4777-8777-777777777777",
            position=1,
            correct=False,
        )
        async with learning_deps(tx).db.user_tx(actor_for(alice)) as utx:
            await apply_result.apply_review_result(
                utx,
                user_id=alice,
                notion_id=seed["notionId"],
                source="global_quiz",
                format_name="recall_card",
                correct=False,
                rating="again",
                time_ms=4000,
                answer_id="77777777-7777-4777-8777-777777777777",
                attempt_id=seed["attemptId"],
                attempt_no=1,
                reviewed_at="2026-11-11T13:00:00.000Z",
            )
        state = (
            (
                await tx.conn.execute(
                    text(
                        """
                    select fsrs, gap_nature::text as nature
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
        logs = (
            (
                await tx.conn.execute(
                    text(
                        """
                    select grade::text as grade, correct
                      from public.review_logs
                     where user_id = cast(:u as uuid)
                    """
                    ),
                    {"u": alice},
                )
            )
            .mappings()
            .all()
        )
        return dict(state), [dict(log) for log in logs]

    state, logs = await rolled_back(database, run)
    assert logs == [{"grade": "again", "correct": False}]
    assert state["fsrs"]["lapses"] == 1
    assert state["fsrs"]["state"] == 3
    # No gap yet: BR-LAC-02 needs the forgetting window or a repeated error.
    assert state["nature"] is None
