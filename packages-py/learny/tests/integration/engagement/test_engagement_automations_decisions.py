"""[SPEC-2205] Automation decisions: accept, decline and undo under RLS.

The learner's decision locks the journal row first (CA-2, CL-1): a foreign identifier is a 404, a
replayed decision returns the committed answer with no second effect, and the definition writes the
effect exactly once. A consumed action answers 422 and keeps its history (BR-AUT-11).
"""

import json
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import (
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    one,
)
from learny.engagement.application.automations import (
    accept_automation_action,
    decline_automation_action,
    undo_automation_action,
)
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.engagement_automations import (
    ACTION_NOT_FOUND,
    DECISION_NOT_PENDING,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")

INSERT_ACTION = text(
    "insert into public.automation_actions "
    "(id, user_id, formation_id, automation, kind, summary, payload, undo_payload, requires_consent, "
    "status, decided_at, created_at) values "
    "(cast(:id as uuid), cast(:user as uuid), cast(:formation as uuid), "
    "cast(:automation as public.automation_key), :kind, :summary, cast(:payload as jsonb), "
    "cast(:undo as jsonb), :requires_consent, cast(:status as public.automation_status), "
    "cast(:decided_at as timestamptz), '2026-11-11T09:00:00Z')"
)

ACTION = "00000000-0000-4000-8000-0000000000a1"
FOREIGN = "00000000-0000-4000-8000-0000000000a2"


async def insert_action(
    tx: Any,
    *,
    user_id: str,
    action_id: str = ACTION,
    formation_id: str | None = None,
    automation: str = "micro_seance",
    kind: str = "micro_session_proposed",
    payload: dict[str, Any] | None = None,
    undo: dict[str, Any] | None = None,
    status: str = "pending_consent",
    requires_consent: bool = True,
    summary: str = "Resume de test",
) -> None:
    await tx.conn.execute(
        INSERT_ACTION,
        {
            "id": action_id,
            "user": user_id,
            "formation": formation_id,
            "automation": automation,
            "kind": kind,
            "summary": summary,
            "payload": json.dumps(payload or {"dedupeKey": action_id}),
            "undo": None if undo is None else json.dumps(undo),
            "requires_consent": requires_consent,
            "status": status,
            "decided_at": "2026-11-11T09:00:00Z" if status != "pending_consent" else None,
        },
    )


def micro_payload(formation_id: str) -> dict[str, Any]:
    return {
        "dedupeKey": "micro:2026-11-11",
        "date": "2026-11-11",
        "hour": 20,
        "durationMin": 5,
        "formationId": formation_id,
        "notionCount": 3,
    }


async def test_accept_applies_the_effect_once_and_journals_it(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Adele")
        formation = await create_formation(tx.conn, user)
        await insert_action(tx, user_id=user, formation_id=formation, payload=micro_payload(formation))
        deps = engagement_deps(tx)

        dto = await accept_automation_action(deps, actor_for(user), ACTION, {})

        assert dto["status"] == "applied"
        assert dto["decidedAt"] is not None
        slot = await one(
            tx.conn,
            "select id::text as id, kind::text as kind, status::text as status, starts_at, ends_at "
            "from public.schedule_slots where id = cast(:id as uuid)",
            id=dto["payload"]["slotId"],
        )
        assert slot["kind"] == "micro_session"
        assert slot["status"] == "planned"
        assert dto["payload"]["slotId"] == dto["undoPayload"]["slotId"]
        slots = await one(
            tx.conn,
            "select count(*)::int as n from public.schedule_slots where user_id = cast(:user as uuid)",
            user=user,
        )
        assert slots["n"] == 1

    await rolled_back(database, run)


async def test_a_replayed_accept_returns_the_committed_row_without_a_second_effect(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Bastien")
        formation = await create_formation(tx.conn, user)
        await insert_action(tx, user_id=user, formation_id=formation, payload=micro_payload(formation))
        deps = engagement_deps(tx)

        first = await accept_automation_action(deps, actor_for(user), ACTION, {})
        second = await accept_automation_action(deps, actor_for(user), ACTION, {})

        assert first["id"] == second["id"]
        assert second["payload"]["slotId"] == first["payload"]["slotId"]
        slots = await one(
            tx.conn,
            "select count(*)::int as n from public.schedule_slots where user_id = cast(:user as uuid)",
            user=user,
        )
        assert slots["n"] == 1

    await rolled_back(database, run)


async def test_decline_keeps_the_row_and_writes_the_refused_summary(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Chloe", timezone="Europe/Paris")
        formation = await create_formation(tx.conn, user)
        await insert_action(tx, user_id=user, formation_id=formation, payload=micro_payload(formation))
        deps = engagement_deps(tx)

        dto = await decline_automation_action(deps, actor_for(user), ACTION)

        assert dto["status"] == "declined"
        assert dto["summary"] == "Refus\u00e9 : micro-s\u00e9ance de 5 min propos\u00e9e \u00e0 20:00."
        slots = await one(
            tx.conn,
            "select count(*)::int as n from public.schedule_slots where user_id = cast(:user as uuid)",
            user=user,
        )
        assert slots["n"] == 0

    await rolled_back(database, run)


async def test_accepting_an_action_of_another_learner_is_a_404(database: Database) -> None:
    async def run(tx: Any) -> None:
        owner = await create_user(tx.conn, "Diane")
        intruder = await create_user(tx.conn, "Elise")
        formation = await create_formation(tx.conn, owner)
        await insert_action(tx, user_id=owner, action_id=FOREIGN, formation_id=formation)
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as refused:
            await accept_automation_action(deps, actor_for(intruder), FOREIGN, {})
        assert refused.value.code == "NOT_FOUND"
        assert refused.value.detail == ACTION_NOT_FOUND

    await rolled_back(database, run)


async def test_accepting_a_decided_action_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Fanny")
        formation = await create_formation(tx.conn, user)
        await insert_action(
            tx,
            user_id=user,
            formation_id=formation,
            status="declined",
            requires_consent=False,
            payload=micro_payload(formation),
        )
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as refused:
            await accept_automation_action(deps, actor_for(user), ACTION, {})
        assert refused.value.code == "CONFLICT"
        assert refused.value.detail == DECISION_NOT_PENDING

    await rolled_back(database, run)


async def test_undo_cancels_the_effect_and_writes_the_cancelled_summary(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Gaspard", timezone="Europe/Paris")
        formation = await create_formation(tx.conn, user)
        slot = await one(
            tx.conn,
            "insert into public.schedule_slots (user_id, formation_id, kind, title, starts_at, "
            "ends_at, status, created_by) values (cast(:user as uuid), cast(:formation as uuid), "
            "'micro_session', 'Micro-s\u00e9ance de secours', '2026-11-11T19:00:00Z', "
            "'2026-11-11T19:05:00Z', 'planned', 'automation') returning id::text as id",
            user=user,
            formation=formation,
        )
        payload = micro_payload(formation)
        await insert_action(
            tx,
            user_id=user,
            formation_id=formation,
            status="applied",
            requires_consent=False,
            payload=payload,
            undo={"slotId": slot["id"]},
        )
        deps = engagement_deps(tx)

        dto = await undo_automation_action(deps, actor_for(user), ACTION)

        assert dto["status"] == "undone"
        assert dto["summary"].startswith("Annul\u00e9 : micro-s\u00e9ance de 5 min du ")
        status = await one(
            tx.conn,
            "select status::text as status from public.schedule_slots where id = cast(:id as uuid)",
            id=slot["id"],
        )
        assert status["status"] == "cancelled"

    await rolled_back(database, run)


async def test_undoing_a_consumed_action_is_a_422(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Hugo")
        formation = await create_formation(tx.conn, user)
        await insert_action(
            tx,
            user_id=user,
            formation_id=formation,
            status="consumed",
            requires_consent=False,
            payload=micro_payload(formation),
            undo={"slotId": "00000000-0000-4000-8000-0000000000b1"},
        )
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as refused:
            await undo_automation_action(deps, actor_for(user), ACTION)
        assert refused.value.code == "AUTOMATION_ACTION_CONSUMED"
        assert refused.value.detail == (
            "Cette action a d\u00e9j\u00e0 \u00e9t\u00e9 consomm\u00e9e : "
            "elle ne peut plus \u00eatre annul\u00e9e."
        )

    await rolled_back(database, run)


async def test_undoing_a_pending_action_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Ines")
        formation = await create_formation(tx.conn, user)
        await insert_action(tx, user_id=user, formation_id=formation, payload=micro_payload(formation))
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as refused:
            await undo_automation_action(deps, actor_for(user), ACTION)
        assert refused.value.code == "CONFLICT"
        assert refused.value.detail == "Seule une action appliqu\u00e9e peut \u00eatre annul\u00e9e."

    await rolled_back(database, run)


async def test_accepting_a_question_creates_one_card_and_undo_retires_it(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Julie")
        formation = await create_formation(tx.conn, user)
        module = await create_module(tx.conn, formation, 1)
        chapter = await create_chapter(tx.conn, formation, module)
        notion = await create_notion(tx.conn, formation, module, chapter)
        payload = {
            "dedupeKey": f"question_card:c1:{notion}",
            "notionId": notion,
            "notionLabel": "Amers",
            "question": "Qu\u2019est-ce qu\u2019un amer ?",
            "answer": "Un point remarquable du littoral.",
            "sourceLabel": "Cours 2",
            "brickId": None,
        }
        await insert_action(
            tx,
            user_id=user,
            formation_id=formation,
            automation="questions_cartes",
            kind="card_created",
            payload=payload,
        )
        deps = engagement_deps(tx)

        accepted = await accept_automation_action(deps, actor_for(user), ACTION, {})

        brick_id = accepted["payload"]["brickId"]
        assert brick_id
        brick = await one(
            tx.conn,
            "select status::text as status, type::text as type from public.bricks "
            "where id = cast(:id as uuid)",
            id=brick_id,
        )
        assert brick == {"status": "active", "type": "recall_card"}
        state = await one(
            tx.conn,
            "select in_review from public.notion_states where notion_id = cast(:id as uuid)",
            id=notion,
        )
        assert state["in_review"] is True

        undone = await undo_automation_action(deps, actor_for(user), ACTION)

        assert undone["status"] == "undone"
        retired = await one(
            tx.conn,
            "select status::text as status from public.bricks where id = cast(:id as uuid)",
            id=brick_id,
        )
        assert retired["status"] == "retired"

    await rolled_back(database, run)
