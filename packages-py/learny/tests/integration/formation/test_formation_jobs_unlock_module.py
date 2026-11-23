"""[SPEC-2207] The module unlock job against the local stack.

A passed validation quiz validates its module, opens the next one, puts the notions in review,
queues `module/validated`, writes the milestone and notifies once. A replay finds the module already
validated and only raises `best_score` (CL-3); a failed attempt writes nothing.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import (
    FIXED,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
)
from learny.formation.application.unlock_module import unlock_module
from learny.shared.db.uow import Database
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

READ_PROGRESS = text(
    """
    select status::text as status, best_score
    from public.module_progress
    where user_id = cast(:user as uuid) and module_id = cast(:module as uuid)
    """
)
READ_FORMATION = text(
    "select status::text as status, completed_at from public.formations where id = cast(:formation as uuid)"
)
COUNT_STATES = text(
    "select count(*)::int as count from public.notion_states "
    "where user_id = cast(:user as uuid) and in_review = true"
)
MILESTONES = text(
    "select key, ref_id::text as ref_id from public.milestones where user_id = cast(:user as uuid)"
)
EVENTS = text("select name, event_id from public.event_outbox where event_id like :pattern order by event_id")
NOTIFICATIONS = text(
    "select count(*)::int as count from public.notifications where user_id = cast(:user as uuid)"
)


async def first(tx: Any, statement: Any, **parameters: Any) -> Any:
    """The first row of one statement, for the assertions that read the stored state."""
    return (await tx.conn.execute(statement, parameters)).mappings().all()[0]


async def scalar(tx: Any, statement: Any, **parameters: Any) -> int:
    return int((await tx.conn.execute(statement, parameters)).mappings().all()[0]["count"])


async def seed(tx: Any, name: str, modules: int = 2) -> dict[str, Any]:
    user_id = await create_user(tx.conn, name, timezone="Europe/Paris")
    formation_id = await create_formation(tx.conn, user_id, title="Accounting")
    created: list[str] = []
    for position in range(1, modules + 1):
        module_id = await create_module(
            tx.conn, formation_id, position, status="open" if position == 1 else "locked"
        )
        chapter_id = await create_chapter(tx.conn, formation_id, module_id)
        await create_notion(tx.conn, formation_id, module_id, chapter_id)
        created.append(module_id)
    return {"userId": user_id, "formationId": formation_id, "modules": created}


async def test_a_passed_quiz_unlocks_the_next_module_once(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await seed(tx, "Amelie")
        deps = engagement_deps(tx, now=FIXED)

        outcome = await unlock_module(
            deps, fixture["userId"], fixture["formationId"], fixture["modules"][0], 82.0, True
        )

        assert outcome["unlocked"] is True
        assert outcome["revisionOnly"] is False
        assert outcome["formationCompleted"] is False
        assert outcome["nextModuleId"] == fixture["modules"][1]
        assert outcome["nextModuleTitle"] == "Partie"
        progress = await first(tx, READ_PROGRESS, user=fixture["userId"], module=fixture["modules"][0])
        assert progress["status"] == "validated"
        assert float(progress["best_score"]) == pytest.approx(82.0)
        following = await first(tx, READ_PROGRESS, user=fixture["userId"], module=fixture["modules"][1])
        assert following["status"] == "open"
        assert await scalar(tx, COUNT_STATES, user=fixture["userId"]) == 1
        events = (await tx.conn.execute(EVENTS, {"pattern": "module-validated:%"})).mappings().all()
        assert [row["event_id"] for row in events] == [f"module-validated:{fixture['modules'][0]}"]
        milestones = (await tx.conn.execute(MILESTONES, {"user": fixture["userId"]})).mappings().all()
        assert [(row["key"], row["ref_id"]) for row in milestones] == [
            ("module_validated", fixture["modules"][0])
        ]
        assert await scalar(tx, NOTIFICATIONS, user=fixture["userId"]) == 1

    await rolled_back(database, run)


async def test_a_replayed_unlock_only_raises_the_best_score(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await seed(tx, "Bertrand")
        deps = engagement_deps(tx, now=FIXED)

        await unlock_module(
            deps, fixture["userId"], fixture["formationId"], fixture["modules"][0], 61.0, True
        )
        replay = await unlock_module(
            deps, fixture["userId"], fixture["formationId"], fixture["modules"][0], 94.0, True
        )

        assert replay == {
            "unlocked": False,
            "revisionOnly": True,
            "formationCompleted": False,
            "nextModuleId": None,
            "nextModulePosition": None,
            "nextModuleTitle": None,
        }
        progress = await first(tx, READ_PROGRESS, user=fixture["userId"], module=fixture["modules"][0])
        assert float(progress["best_score"]) == pytest.approx(94.0)
        events = (await tx.conn.execute(EVENTS, {"pattern": "module-validated:%"})).mappings().all()
        assert len(events) == 1
        assert await scalar(tx, NOTIFICATIONS, user=fixture["userId"]) == 1

    await rolled_back(database, run)


async def test_a_failed_attempt_writes_nothing(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await seed(tx, "Camille")
        deps = engagement_deps(tx, now=FIXED)

        outcome = await unlock_module(
            deps, fixture["userId"], fixture["formationId"], fixture["modules"][0], 30.0, False
        )

        assert outcome["unlocked"] is False
        assert outcome["revisionOnly"] is False
        progress = await tx.conn.execute(
            text(
                "select count(*)::int as count from public.module_progress "
                "where user_id = cast(:user as uuid)"
            ),
            {"user": fixture["userId"]},
        )
        assert int(progress.mappings().all()[0]["count"]) == 0
        assert (await tx.conn.execute(EVENTS, {"pattern": "module-validated:%"})).mappings().all() == []

    await rolled_back(database, run)


async def test_the_last_module_completes_the_formation(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await seed(tx, "Damien", modules=1)
        deps = engagement_deps(tx, now=FIXED)

        outcome = await unlock_module(
            deps, fixture["userId"], fixture["formationId"], fixture["modules"][0], 88.0, True
        )

        assert outcome["formationCompleted"] is True
        assert outcome["nextModuleId"] is None
        formation = await first(tx, READ_FORMATION, formation=fixture["formationId"])
        assert formation["status"] == "completed"
        assert formation["completed_at"] is not None
        events = (await tx.conn.execute(EVENTS, {"pattern": "formation-completed:%"})).mappings().all()
        assert [row["event_id"] for row in events] == [f"formation-completed:{fixture['formationId']}"]

    await rolled_back(database, run)
