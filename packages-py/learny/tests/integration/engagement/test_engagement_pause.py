"""[SPEC-2205] Global pause: start, state, return day, end and diagnostic.

The pause service freezes the future slots of every active formation, journals one `pause_started`
action, finalises the pause once on the return day (EF-2), and only replans after a real diagnostic
result (ET-4, CL-5). Every read runs under the learner's RLS: a foreign pause is simply absent.
"""

import json
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import (
    actor_for,
    create_formation,
    create_module,
    create_user,
    one,
)
from learny.engagement.application.pause import (
    complete_pause_diagnostic,
    end_pause,
    get_pause_state,
    start_pause,
)
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.engagement_automations import PAUSE_STARTED
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")

INSERT_ACTION = text(
    "insert into public.automation_actions "
    "(user_id, formation_id, automation, kind, summary, payload, undo_payload, requires_consent, "
    "status, decided_at, created_at) values "
    "(cast(:user as uuid), null, 'pause', :kind, :summary, cast(:payload as jsonb), null, false, "
    "'applied', '2026-11-11T09:00:00Z', '2026-11-11T09:00:00Z')"
)


async def seed_pause(
    tx: Any,
    *,
    user_id: str,
    starts_on: str,
    ends_on: str,
    diagnostic: bool = False,
    status: str = "active",
    paused: list[str] | None = None,
) -> str:
    pause = await one(
        tx.conn,
        "insert into public.pauses (user_id, starts_on, ends_on, diagnostic_on_return, status, "
        "ended_at) values (cast(:user as uuid), cast(:starts_on as date), cast(:ends_on as date), "
        ":diagnostic, cast(:status as public.pause_status), "
        "case when :status = 'ended' then '2026-11-11T12:20:00Z'::timestamptz else null end) "
        "returning id::text as id",
        user=user_id,
        starts_on=starts_on,
        ends_on=ends_on,
        diagnostic=diagnostic,
        status=status,
    )
    await tx.conn.execute(
        INSERT_ACTION,
        {
            "user": user_id,
            "kind": "pause_started",
            "summary": "Pause d\u00e9clar\u00e9e.",
            "payload": json.dumps(
                {
                    "dedupeKey": f"pause:start:{pause['id']}",
                    "pauseId": pause["id"],
                    "endDate": ends_on,
                    "startsOn": starts_on,
                    "diagnosticEnabled": diagnostic,
                    "pausedFormationIds": paused or [],
                }
            ),
        },
    )
    return str(pause["id"])


async def test_get_without_pause_returns_the_explicit_none_state(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Adele")
        deps = engagement_deps(tx)

        state = await get_pause_state(deps, actor_for(user))

        assert state == {
            "status": "none",
            "startsOn": None,
            "endsOn": None,
            "diagnosticOnReturn": True,
            "endedAt": None,
            "pausedFormationIds": [],
            "returnDue": False,
            "diagnostic": None,
        }

    await rolled_back(database, run)


async def test_start_freezes_the_formation_and_journals_the_pause(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Bastien", timezone="Europe/Paris")
        formation = await create_formation(tx.conn, user)
        await create_module(tx.conn, formation, 1)
        await tx.conn.execute(
            text(
                "insert into public.schedule_slots (user_id, formation_id, kind, title, starts_at, "
                "ends_at, status, created_by) values (cast(:user as uuid), cast(:formation as uuid), "
                "'course', 'Slot futur', '2026-11-20T09:00:00Z', '2026-11-20T10:00:00Z', "
                "'planned', 'planner')"
            ),
            {"user": user, "formation": formation},
        )
        deps = engagement_deps(tx)

        state = await start_pause(
            deps, actor_for(user), {"endDate": "2026-11-18", "diagnosticEnabled": False}
        )

        assert state["status"] == "active"
        assert state["startsOn"] == "2026-11-11"
        assert state["endsOn"] == "2026-11-18"
        assert state["pausedFormationIds"] == [formation]
        paused = await one(
            tx.conn,
            "select status::text as status from public.formations where id = cast(:id as uuid)",
            id=formation,
        )
        assert paused["status"] == "paused"
        slot = await one(
            tx.conn,
            "select status::text as status from public.schedule_slots "
            "where formation_id = cast(:formation as uuid)",
            formation=formation,
        )
        assert slot["status"] == "cancelled"
        journal = await one(
            tx.conn,
            "select kind, status::text as status, summary from public.automation_actions "
            "where automation = 'pause'",
        )
        assert journal["kind"] == "pause_started"
        assert journal["status"] == "applied"
        assert journal["summary"] == PAUSE_STARTED["vous"].format(end_date="2026-11-18")

    await rolled_back(database, run)


async def test_start_replayed_with_the_same_end_date_writes_one_journal_row(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Chloe", timezone="Europe/Paris")
        await create_formation(tx.conn, user)
        deps = engagement_deps(tx)

        first = await start_pause(deps, actor_for(user), {"endDate": "2026-11-18", "diagnosticEnabled": True})
        second = await start_pause(
            deps, actor_for(user), {"endDate": "2026-11-18", "diagnosticEnabled": True}
        )

        assert first == second
        count = await one(
            tx.conn,
            "select count(*)::int as n from public.automation_actions where automation = 'pause'",
        )
        assert count["n"] == 1

    await rolled_back(database, run)


async def test_start_with_another_end_date_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Diane", timezone="Europe/Paris")
        await create_formation(tx.conn, user)
        deps = engagement_deps(tx)
        await start_pause(deps, actor_for(user), {"endDate": "2026-11-18", "diagnosticEnabled": True})

        with pytest.raises(AppError) as refused:
            await start_pause(deps, actor_for(user), {"endDate": "2026-11-20", "diagnosticEnabled": True})
        assert refused.value.code == "CONFLICT"

    await rolled_back(database, run)


async def test_start_with_an_end_date_before_today_is_a_422(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Elise", timezone="Europe/Paris")
        await create_formation(tx.conn, user)
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as refused:
            await start_pause(deps, actor_for(user), {"endDate": "2026-11-10", "diagnosticEnabled": True})
        assert refused.value.code == "VALIDATION_FAILED"
        assert refused.value.status == 422
        assert refused.value.detail == (
            "Date de fin invalide : la fin de pause ne peut pas pr\u00e9c\u00e9der aujourd\u2019hui."
        )

    await rolled_back(database, run)


async def test_a_read_on_the_return_day_ends_the_pause_once(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Fanny", timezone="Europe/Paris")
        pause = await seed_pause(
            tx, user_id=user, starts_on="2026-11-04", ends_on="2026-11-10", diagnostic=False
        )
        deps = engagement_deps(tx)

        state = await get_pause_state(deps, actor_for(user))
        again = await get_pause_state(deps, actor_for(user))

        assert state["status"] == "ended"
        assert state["returnDue"] is False
        assert again["status"] == "ended"
        ended = await one(
            tx.conn,
            "select count(*)::int as n from public.automation_actions "
            "where automation = 'pause' and kind = 'pause_ended'",
        )
        assert ended["n"] == 1
        row = await one(
            tx.conn,
            "select status::text as status, payload from public.automation_actions "
            "where automation = 'pause' and kind = 'pause_ended'",
        )
        assert row["status"] == "applied"
        assert row["payload"]["pauseId"] == pause

    await rolled_back(database, run)


async def test_end_resumes_the_frozen_formation(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Gaspard", timezone="Europe/Paris")
        formation = await create_formation(tx.conn, user, status="paused")
        await create_module(tx.conn, formation, 1)
        await seed_pause(
            tx,
            user_id=user,
            starts_on="2026-11-04",
            ends_on="2026-11-18",
            diagnostic=False,
            paused=[formation],
        )
        deps = engagement_deps(tx)

        state = await end_pause(deps, actor_for(user))

        assert state["status"] == "ended"
        resumed = await one(
            tx.conn,
            "select status::text as status from public.formations where id = cast(:id as uuid)",
            id=formation,
        )
        assert resumed["status"] == "active"
        ended = await one(
            tx.conn,
            "select count(*)::int as n from public.automation_actions "
            "where automation = 'pause' and kind = 'pause_ended'",
        )
        assert ended["n"] == 1

    await rolled_back(database, run)


async def test_a_diagnostic_without_a_pending_proposal_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Hugo", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as refused:
            await complete_pause_diagnostic(deps, actor_for(user), {"answered": 3, "correct": 2})
        assert refused.value.code == "CONFLICT"
        assert refused.value.detail == "Aucun diagnostic de retour en attente."

    await rolled_back(database, run)


async def test_a_diagnostic_without_any_answer_does_not_replan(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Ines", timezone="Europe/Paris")
        formation = await create_formation(tx.conn, user, status="paused")
        await seed_pause(
            tx,
            user_id=user,
            starts_on="2026-11-04",
            ends_on="2026-11-18",
            diagnostic=True,
            status="ended",
            paused=[formation],
        )
        await tx.conn.execute(
            text(
                "insert into public.automation_actions (user_id, formation_id, automation, kind, "
                "summary, payload, undo_payload, requires_consent, status, decided_at, created_at) "
                "values (cast(:user as uuid), null, 'pause', 'pause_ended', 'Pause termin\u00e9e.', "
                "cast(:payload as jsonb), null, false, 'applied', '2026-11-11T09:00:00Z', "
                "'2026-11-11T09:00:00Z')"
            ),
            {
                "user": user,
                "payload": json.dumps(
                    {
                        "dedupeKey": "pause:end:1",
                        "pauseId": "00000000-0000-4000-8000-0000000000c1",
                        "endDate": "2026-11-18",
                        "diagnosticEnabled": True,
                        "pausedFormationIds": [formation],
                        "diagnostic": {
                            "minutes": 10,
                            "formationId": formation,
                            "notionIds": [],
                            "answered": None,
                            "correct": None,
                            "completedAt": None,
                        },
                    }
                ),
            },
        )
        deps = engagement_deps(tx)

        with pytest.raises(AppError) as refused:
            await complete_pause_diagnostic(deps, actor_for(user), {"answered": 0, "correct": 0})
        assert refused.value.code == "VALIDATION_FAILED"
        assert refused.value.status == 422

    await rolled_back(database, run)


async def test_a_real_diagnostic_result_writes_the_daily_activity_and_resumes(
    database: Database,
) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Julie", timezone="Europe/Paris")
        formation = await create_formation(tx.conn, user, status="paused")
        await create_module(tx.conn, formation, 1)
        await seed_pause(
            tx,
            user_id=user,
            starts_on="2026-11-04",
            ends_on="2026-11-18",
            diagnostic=True,
            status="ended",
            paused=[formation],
        )
        await tx.conn.execute(
            text(
                "insert into public.automation_actions (user_id, formation_id, automation, kind, "
                "summary, payload, undo_payload, requires_consent, status, decided_at, created_at) "
                "values (cast(:user as uuid), null, 'pause', 'pause_ended', 'Pause termin\u00e9e.', "
                "cast(:payload as jsonb), null, false, 'applied', '2026-11-11T09:00:00Z', "
                "'2026-11-11T09:00:00Z')"
            ),
            {
                "user": user,
                "payload": json.dumps(
                    {
                        "dedupeKey": "pause:end:1",
                        "pauseId": "00000000-0000-4000-8000-0000000000c1",
                        "endDate": "2026-11-18",
                        "diagnosticEnabled": True,
                        "pausedFormationIds": [formation],
                        "diagnostic": {
                            "minutes": 10,
                            "formationId": formation,
                            "notionIds": [],
                            "answered": None,
                            "correct": None,
                            "completedAt": None,
                        },
                    }
                ),
            },
        )
        deps = engagement_deps(tx)

        state = await complete_pause_diagnostic(deps, actor_for(user), {"answered": 4, "correct": 3})

        assert state["status"] == "ended"
        assert state["diagnostic"]["answered"] == 4
        assert state["diagnostic"]["correct"] == 3
        assert state["diagnostic"]["completedAt"] == "2026-11-11T12:20:00.000Z"
        activity = await one(
            tx.conn,
            "select minutes, qualifying, sources from public.daily_activity "
            "where user_id = cast(:user as uuid)",
            user=user,
        )
        assert activity["minutes"] == 10
        assert activity["qualifying"] is True
        resumed = await one(
            tx.conn,
            "select status::text as status from public.formations where id = cast(:id as uuid)",
            id=formation,
        )
        assert resumed["status"] == "active"

    await rolled_back(database, run)


async def test_a_pause_of_another_learner_is_invisible(database: Database) -> None:
    async def run(tx: Any) -> None:
        owner = await create_user(tx.conn, "Karine", timezone="Europe/Paris")
        intruder = await create_user(tx.conn, "Loic", timezone="Europe/Paris")
        await seed_pause(tx, user_id=owner, starts_on="2026-11-04", ends_on="2026-11-18")
        deps = engagement_deps(tx)

        state = await get_pause_state(deps, actor_for(intruder))

        assert state["status"] == "none"

    await rolled_back(database, run)
