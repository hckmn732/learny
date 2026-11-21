"""[SPEC-2202] Streak, regularity and milestones (SPEC-723, BR-GAM-02, BR-GAM-03).

The service reads the persisted `daily_activity` of the learner and reconciles the milestones with
the service role, exactly like `serie-regularite-et-jalons-interface.ts`: a replay inserts nothing
and a foreign formation filter is a 404 that never reveals its existence.
"""

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
from learny.learning.application import series as series_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import SeriesMilestonesOutput, SeriesStreakOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


async def create_activity(conn: Any, user_id: str, day: str, *, qualifying: bool = True) -> None:
    """One persisted activity entry, the only source of the streak (ET-4)."""
    await conn.execute(
        text(
            """
            insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
            values (cast(:user as uuid), cast(:day as date), 30, :qualifying, '{global_quiz}')
            """
        ),
        {"user": user_id, "day": day, "qualifying": qualifying},
    )


async def create_module_progress(
    conn: Any, user_id: str, module_id: str, *, status: str = "validated"
) -> None:
    await conn.execute(
        text(
            """
            insert into public.module_progress (user_id, module_id, status, validated_at)
            values (
              cast(:user as uuid), cast(:module as uuid), cast(:status as public.module_status),
              case when cast(:status as text) = 'validated'
                   then '2026-11-10T09:00:00Z'::timestamptz else null end
            )
            """
        ),
        {"user": user_id, "module": module_id, "status": status},
    )


async def test_the_streak_counts_the_qualifying_days(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        for day in ("2026-11-09", "2026-11-10", "2026-11-11"):
            await create_activity(tx.conn, alice, day)
        await create_activity(tx.conn, alice, "2026-11-06", qualifying=False)
        return await series_service.get_streak(learning_deps(tx), actor_for(alice))

    streak = await rolled_back(database, run)
    parsed = SeriesStreakOutput.model_validate(streak)
    assert parsed.days == 3
    assert parsed.computedOn == "2026-11-11"
    assert parsed.timezone == "Europe/Paris"
    statuses = {item.date: item.status for item in parsed.regularity}
    assert statuses["2026-11-11"] == "done"
    assert statuses["2026-11-10"] == "done"
    assert statuses["2026-11-09"] == "done"
    # A study day without a qualifying activity is a miss, a weekend day stays neutral.
    assert statuses["2026-11-06"] == "none"
    assert statuses["2026-11-08"] == "neutral"
    assert parsed.nextMilestone is not None
    assert parsed.nextMilestone.kind == "streak_30"
    assert parsed.nextMilestone.remaining == 27


async def test_the_streak_of_a_learner_without_activity_is_zero(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        return await series_service.get_streak(learning_deps(tx), actor_for(alice))

    streak = await rolled_back(database, run)
    assert SeriesStreakOutput.model_validate(streak).days == 0


async def test_milestones_are_inserted_once_and_labelled(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        module_id = await create_module(tx.conn, formation_id, 1, title="R\u00e9seaux")
        await create_module_progress(tx.conn, alice, module_id)
        deps = learning_deps(tx)
        actor = actor_for(alice)
        first = await series_service.get_milestones(deps, actor)
        second = await series_service.get_milestones(deps, actor)
        rows = (
            (
                await tx.conn.execute(
                    text(
                        "select count(*)::int as count from public.milestones "
                        "where user_id = cast(:user as uuid)"
                    ),
                    {"user": alice},
                )
            )
            .mappings()
            .all()
        )
        return first, second, int(rows[0]["count"]), module_id

    first, second, count, module_id = await rolled_back(database, run)
    parsed = SeriesMilestonesOutput.model_validate(first)
    assert count == 1
    assert [item.key for item in parsed.items] == [f"module_validated:{module_id}"]
    item = parsed.items[0]
    assert item.kind == "module_validated"
    assert item.label == "Module \u00ab R\u00e9seaux \u00bb valid\u00e9"
    assert item.formationTitle == "SAP"
    assert item.achievedOn == "2026-11-11"
    assert SeriesMilestonesOutput.model_validate(second).items[0].id == item.id


async def test_milestones_of_a_foreign_formation_are_a_404(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        formation_id = await create_formation(tx.conn, alice, status="active")
        with pytest.raises(AppError) as failure:
            await series_service.get_milestones(learning_deps(tx), actor_for(bob), formation_id)
        return failure.value

    error = await rolled_back(database, run)
    assert error.code == "NOT_FOUND"


async def test_the_next_milestone_is_the_open_module_of_the_current_formation(
    database: Database,
) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        module_id = await create_module(tx.conn, formation_id, 1, title="R\u00e9seaux")
        chapter_id = await create_chapter(tx.conn, formation_id, module_id)
        await create_notion(tx.conn, formation_id, module_id, chapter_id)
        await tx.conn.execute(
            text(
                "update public.profiles set current_formation_id = cast(:fid as uuid) "
                "where id = cast(:user as uuid)"
            ),
            {"fid": formation_id, "user": alice},
        )
        return await series_service.get_streak(learning_deps(tx), actor_for(alice))

    streak = await rolled_back(database, run)
    parsed = SeriesStreakOutput.model_validate(streak)
    assert parsed.nextMilestone is not None
    assert parsed.nextMilestone.kind == "module_validated"
    assert parsed.nextMilestone.label == "Module \u00ab R\u00e9seaux \u00bb \u00e0 valider"
    assert parsed.nextMilestone.remaining == 1
