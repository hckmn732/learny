"""[SPEC-2202] First-pass answer of the daily warm-up (SPEC-714 EF-8, EF-9, EF-11, ET-4).

One transaction records the answer, applies FSRS through the shared application, moves a
notion to review into the evening quiz and queues the `review/answered` event. A repeated
position is a 409 and a foreign activity is invisible under RLS.
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
    event_by_id,
)
from factories.learning_deps import learning_deps
from learny.learning.application import warmups as warmup_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import WarmupsAnswersCreateOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


async def seed_warmup(conn: Any, user_id: str, *, items: int = 2) -> dict[str, Any]:
    """One ready warm-up of the day with `items` recall cards and their active bricks."""
    formation_id = await create_formation(conn, user_id, title="SAP")
    module_id = await create_module(conn, formation_id, 1, title="Reseaux", status="validated")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    refs = []
    notion_ids = []
    for position in range(items):
        notion_id = await create_notion(conn, formation_id, module_id, chapter_id, position=position + 1)
        notion_ids.append(notion_id)
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
                          cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor'
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
        refs.append({"brickId": brick_id, "brickVersionId": version_id})
    config = {
        "scope": "yesterday",
        "items": [
            {"position": position, "notionId": notion_id, "tag": "yesterday", "moduleNumber": None}
            for position, notion_id in enumerate(notion_ids)
        ],
    }
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
                      cast('2026-11-11' as date)
                    )
                    returning id::text as id
                    """
                ),
                {
                    "user": user_id,
                    "formation": formation_id,
                    "module": module_id,
                    "config": json.dumps(config),
                    "items": json.dumps(refs),
                },
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    await conn.execute(
        text(
            """
            insert into public.automation_actions (
              user_id, formation_id, automation, kind, status, summary, payload
            ) values (
              cast(:user as uuid), cast(:formation as uuid), 'echauffement', 'warmup_ready',
              'applied', 'Echauffement pret', cast(:payload as jsonb)
            )
            """
        ),
        {
            "user": user_id,
            "formation": formation_id,
            "payload": json.dumps({"activityId": activity_id, "reviewRemaining": False}),
        },
    )
    return {
        "formationId": formation_id,
        "activityId": activity_id,
        "notionIds": notion_ids,
        "refs": refs,
    }


async def test_the_first_answer_records_the_review_and_its_event(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_warmup(tx.conn, alice)
        dto = await warmup_service.answer_warmup(
            learning_deps(tx),
            actor_for(alice),
            seed["activityId"],
            {"position": 0, "knew": True},
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
        event = await event_by_id(tx.conn, f"warmup:{seed['activityId']}:0")
        return dto, logs, event

    dto, logs, event = await rolled_back(database, run)
    parsed = WarmupsAnswersCreateOutput.model_validate(dto)
    assert parsed.status == "in_progress"
    assert len(parsed.answers) == 1
    assert parsed.answers[0].position == 0
    assert parsed.answers[0].knew is True
    assert logs == 1
    assert event is not None
    assert event.name == "review/answered"


async def test_a_known_last_answer_closes_the_first_pass(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_warmup(tx.conn, alice, items=1)
        dto = await warmup_service.answer_warmup(
            learning_deps(tx),
            actor_for(alice),
            seed["activityId"],
            {"position": 0, "knew": False},
        )
        attempt = (
            (
                await tx.conn.execute(
                    text(
                        """
                    select status, score::text as score from public.attempts
                     where activity_id = cast(:a as uuid)
                    """
                    ),
                    {"a": seed["activityId"]},
                )
            )
            .mappings()
            .one()
        )
        action = (
            (
                await tx.conn.execute(
                    text(
                        """
                    select status, summary, payload from public.automation_actions
                     where user_id = cast(:u as uuid) and automation = 'echauffement'
                    """
                    ),
                    {"u": alice},
                )
            )
            .mappings()
            .one()
        )
        day = (
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
        return dto, dict(attempt), dict(action), dict(day)

    dto, attempt, action, day = await rolled_back(database, run)
    parsed = WarmupsAnswersCreateOutput.model_validate(dto)
    assert parsed.status == "done"
    assert parsed.answers[0].knew is False
    assert attempt["status"] == "graded"
    assert float(attempt["score"]) == 0
    assert action["status"] == "consumed"
    assert action["payload"]["knewCount"] == 0
    assert action["payload"]["reviewNotionIds"] != []
    assert day["minutes"] >= 1
    assert day["qualifying"] is False


async def test_a_repeated_position_and_a_bad_position_are_refused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        seed = await seed_warmup(tx.conn, alice)
        await warmup_service.answer_warmup(
            learning_deps(tx),
            actor_for(alice),
            seed["activityId"],
            {"position": 0, "knew": True},
        )
        codes = []
        for position in (0, 5):
            try:
                await warmup_service.answer_warmup(
                    learning_deps(tx),
                    actor_for(alice),
                    seed["activityId"],
                    {"position": position, "knew": True},
                )
            except AppError as error:
                codes.append(error.code)
        return codes

    assert await rolled_back(database, run) == ["CONFLICT", "VALIDATION_FAILED"]


async def test_a_foreign_warmup_is_invisible(database: Database) -> None:
    async def run(tx: Any) -> str:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        seed = await seed_warmup(tx.conn, alice)
        try:
            await warmup_service.answer_warmup(
                learning_deps(tx),
                actor_for(bob),
                seed["activityId"],
                {"position": 0, "knew": True},
            )
        except AppError as error:
            return error.code
        return "OK"

    assert await rolled_back(database, run) == "NOT_FOUND"
