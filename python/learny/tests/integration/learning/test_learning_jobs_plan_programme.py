"""[SPEC-2207] The initial planning of a validated programme.

The first run writes the planner slots of the formation; a replay finds them and writes nothing, so
a duplicated delivery of `formation/programme-validated` never plans twice.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    FIXED,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
)
from factories.learning_deps import learning_deps
from learny.learning.application.plan_programme import (
    REASON_ALREADY_PLANNED,
    plan_programme,
)
from learny.shared.db.uow import Database
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

UPDATE_FORMATION = text(
    """
    update public.formations
    set start_date = date '2026-11-12', end_date = date '2026-12-24', volume_hours = 12
    where id = cast(:formation as uuid)
    """
)
COUNT_SLOTS = text(
    "select count(*)::int as count from public.schedule_slots "
    "where formation_id = cast(:formation as uuid) and planner_key is not null"
)
SELECT_SLOTS = text(
    "select planner_key, created_by::text as created_by, status::text as status "
    "from public.schedule_slots where formation_id = cast(:formation as uuid) "
    "order by starts_at, planner_key"
)


async def seed(tx: Any, name: str, modules: int = 3) -> dict[str, Any]:
    user_id = await create_user(tx.conn, name, timezone="Europe/Paris")
    formation_id = await create_formation(tx.conn, user_id, title="Accounting")
    await tx.conn.execute(UPDATE_FORMATION, {"formation": formation_id})
    created: list[str] = []
    for position in range(1, modules + 1):
        module_id = await create_module(tx.conn, formation_id, position, title=f"Partie {position}")
        chapter_id = await create_chapter(tx.conn, formation_id, module_id)
        await create_notion(tx.conn, formation_id, module_id, chapter_id, position=1)
        created.append(module_id)
    return {"userId": user_id, "formationId": formation_id, "modules": created}


async def test_the_first_run_plans_the_slots_of_the_programme(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await seed(tx, "Sacha")
        deps = learning_deps(tx, now=FIXED)

        result = await plan_programme(deps, fixture["userId"], fixture["formationId"])

        assert result["planned"] > 0
        assert result["conflicts"] >= 0
        rows = (await tx.conn.execute(SELECT_SLOTS, {"formation": fixture["formationId"]})).mappings().all()
        assert len(rows) == result["planned"]
        assert {row["created_by"] for row in rows} == {"planner"}
        assert {row["status"] for row in rows} == {"planned"}
        assert len({row["planner_key"] for row in rows}) == len(rows)

    await rolled_back(database, run)


async def test_a_replayed_validation_writes_nothing(database: Database) -> None:
    async def run(tx: Any) -> None:
        fixture = await seed(tx, "Thea")
        deps = learning_deps(tx, now=FIXED)

        first = await plan_programme(deps, fixture["userId"], fixture["formationId"])
        second = await plan_programme(deps, fixture["userId"], fixture["formationId"])

        assert first["planned"] > 0
        assert second == {"planned": 0, "reason": REASON_ALREADY_PLANNED}
        assert (
            int(
                (await tx.conn.execute(COUNT_SLOTS, {"formation": fixture["formationId"]}))
                .mappings()
                .all()[0]["count"]
            )
            == first["planned"]
        )

    await rolled_back(database, run)


async def test_an_unknown_formation_plans_nothing(database: Database) -> None:
    async def run(tx: Any) -> None:
        user_id = await create_user(tx.conn, "Ulysse")
        formation_id = await create_formation(tx.conn, user_id)
        other = await create_user(tx.conn, "Victor")
        deps = learning_deps(tx, now=FIXED)

        result = await plan_programme(deps, other, formation_id)

        assert result["planned"] == 0
        assert "reason" in result

    await rolled_back(database, run)
