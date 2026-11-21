"""[SPEC-2202] Daily warm-up read model (SPEC-714 EF-7, ET-2).

The card is built from the exact brick versions the activity stores, the next session comes from
the day's schedule, and every read runs under the learner's RLS transaction: a foreign activity
never appears (CA-7).
"""

import json
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
)
from factories.learning_deps import learning_deps
from learny.learning.application import warmups as warmup_service
from learny.shared.db.uow import Database
from learny_api.generated.models import WarmupsTodayGetOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")

TODAY = "2026-11-11"


async def seed_warmup(
    conn: Any, user_id: str, *, with_item: bool = True, with_answer: bool = True
) -> dict[str, Any]:
    """One ready warm-up of the day, its recall card and the upcoming course session."""
    formation_id = await create_formation(conn, user_id, title="SAP", status="active")
    module_id = await create_module(conn, formation_id, 1, title="Reseaux")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_id = await create_notion(conn, formation_id, module_id, chapter_id)
    brick_id = (
        (
            await conn.execute(
                text(
                    """
                    insert into public.bricks (
                      owner_id, formation_id, type, notion_ids, purpose, status
                    ) values (
                      cast(:user as uuid), cast(:formation as uuid), 'recall_card',
                      array[cast(:notion as uuid)], 'warmup', 'active'
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
                    insert into public.brick_versions (
                      brick_id, version, payload, origin, created_by
                    ) values (
                      cast(:brick as uuid), 1,
                      cast(:payload as jsonb), 'tutor', 'tutor'
                    )
                    returning id::text as id
                    """
                ),
                {
                    "brick": brick_id,
                    "payload": json.dumps({"front": "Qu'est-ce qu'un reseau ?", "back": "Un maillage."}),
                },
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    blank_version_id = (
        (
            await conn.execute(
                text(
                    """
                    insert into public.brick_versions (
                      brick_id, version, payload, origin, created_by
                    ) values (
                      cast(:brick as uuid), 2, cast(:payload as jsonb), 'tutor', 'tutor'
                    )
                    returning id::text as id
                    """
                ),
                {"brick": brick_id, "payload": json.dumps({"front": "Question sans reponse"})},
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    config = {
        "scope": "yesterday",
        "items": [
            {
                "position": 0,
                "notionId": notion_id,
                "tag": "prerequisite",
                "moduleNumber": 1,
            }
        ],
    }
    items = (
        [{"brickId": brick_id, "brickVersionId": version_id}]
        if with_item
        else [
            {
                "brickId": brick_id,
                "brickVersionId": blank_version_id,
            }
        ]
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
                      'warmup', cast(:config as jsonb), cast(:items as jsonb), 'ready',
                      cast(:today as date)
                    )
                    returning id::text as id
                    """
                ),
                {
                    "user": user_id,
                    "formation": formation_id,
                    "module": module_id,
                    "config": json.dumps(config),
                    "items": json.dumps(items),
                    "today": TODAY,
                },
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    attempt_id = str(
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
    if with_answer:
        await conn.execute(
            text(
                """
                insert into public.answers (
                  attempt_id, brick_version_id, position, response, is_correct
                ) values (
                  cast(:attempt as uuid), cast(:version as uuid), 1,
                  jsonb_build_object('knew', true), true
                )
                """
            ),
            {"attempt": attempt_id, "version": version_id},
        )
    await conn.execute(
        text(
            """
            insert into public.schedule_slots (
              user_id, formation_id, module_id, kind, title, starts_at, ends_at,
              status, created_by
            ) values (
              cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
              'course', 'Cours', '2026-11-11T14:00:00Z'::timestamptz,
              '2026-11-11T15:00:00Z'::timestamptz, 'planned', 'planner'
            )
            """
        ),
        {"user": user_id, "formation": formation_id, "module": module_id},
    )
    return {
        "formationId": formation_id,
        "moduleId": module_id,
        "activityId": activity_id,
        "attemptId": attempt_id,
    }


async def test_the_warmup_of_the_day_is_built_from_its_bricks(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_warmup(tx.conn, alice)
        return await warmup_service.get_today_warmups(learning_deps(tx), actor_for(alice)), seed

    response, seed = await rolled_back(database, run)
    parsed = WarmupsTodayGetOutput.model_validate(response)
    assert len(parsed.items) == 1
    card = parsed.items[0]
    assert card.activityId == seed["activityId"]
    assert card.scope == "yesterday"
    assert card.status == "done"
    assert card.reviewRemaining is False
    assert card.answers[0].position == 0
    assert card.answers[0].knew is True
    item = card.items[0]
    assert item.notionLabel == "Notion 1"
    assert item.tag == "prerequisite"
    assert item.moduleNumber == 1
    assert item.question == "Qu'est-ce qu'un reseau ?"
    assert item.answer == "Un maillage."
    assert card.nextSession.kind == "course"
    assert card.nextSession.startsAt == "2026-11-11T15:00:00+01:00"
    assert card.nextSession.href.endswith("/modules/" + seed["moduleId"] + "/cours")


async def test_a_card_without_answer_is_todo(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        await seed_warmup(tx.conn, alice, with_answer=False)
        return await warmup_service.get_today_warmups(learning_deps(tx), actor_for(alice))

    parsed = WarmupsTodayGetOutput.model_validate(await rolled_back(database, run))
    assert parsed.items[0].status == "todo"
    assert parsed.items[0].answers == []


async def test_another_learner_never_sees_the_warmup(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        await seed_warmup(tx.conn, alice)
        return await warmup_service.get_today_warmups(learning_deps(tx), actor_for(bob))

    parsed = WarmupsTodayGetOutput.model_validate(await rolled_back(database, run))
    assert parsed.items == []


async def test_an_unreadable_item_is_not_displayed(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        await seed_warmup(tx.conn, alice, with_item=False)
        return await warmup_service.get_today_warmups(learning_deps(tx), actor_for(alice))

    parsed = WarmupsTodayGetOutput.model_validate(await rolled_back(database, run))
    assert parsed.items == []


async def test_the_helpers_derive_the_card_texts() -> None:
    assert warmup_service.warmup_scope_of({"scope": "yesterday"}) == "yesterday"
    assert warmup_service.warmup_scope_of({"scope": "yesterday_and_prerequisites"}) == (
        "yesterday_prerequisites"
    )
    assert (
        warmup_service.warmup_status(item_count=3, answer_count=0, attempt_status=None, submitted=False)
        == "todo"
    )
    assert (
        warmup_service.warmup_status(item_count=3, answer_count=3, attempt_status=None, submitted=False)
        == "done"
    )
    assert warmup_service.offset_iso("2026-11-11T13:00:00Z", "Europe/Paris") == ("2026-11-11T14:00:00+01:00")
    assert (
        warmup_service.next_session_href(
            kind="validation_quiz", formation_id="f", module_id="m", activity_id=None
        )
        == "/formations/f/modules/m/quiz"
    )
    assert (
        warmup_service.next_session_href(kind="mock_exam", formation_id="f", module_id=None, activity_id=None)
        == "/formations/f/examen-blanc"
    )
    assert warmup_service.question_of_brick("recall_card", {"front": "Q", "back": "R"}) == {
        "question": "Q",
        "answer": "R",
    }
    assert warmup_service.question_of_brick("recall_card", {"front": "Q"}) is None
