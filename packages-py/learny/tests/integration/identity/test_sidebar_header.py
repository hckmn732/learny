"""[SPEC-2201] Header and sidebar."""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    FIXED,
    actor_for,
    create_chapter,
    create_daily_activity,
    create_formation,
    create_group,
    create_module,
    create_notification,
    create_notion,
    create_notion_state,
    create_user,
    deps_for,
    join_group,
    one,
)
from learny.identity.application.sidebar import get_sidebar, update_sidebar
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import FORMATION_NOT_FOUND
from learny.shared.time import parse_iso
from learny.views.header import get_header
from learny_api.generated.models import HeaderGetOutput, SidebarGetOutput, SidebarUpdateOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2201")


async def set_current_formation(
    tx: Any,
    user_id: str,
    formation_id: str | None,
    *,
    streak_days: int | None = None,
) -> None:
    await tx.conn.execute(
        text(
            "update public.profiles set current_formation_id = cast(:formation as uuid), "
            "streak_days = coalesce(:days, streak_days) where id = cast(:user as uuid)"
        ),
        {"formation": formation_id, "days": streak_days, "user": user_id},
    )


async def workspace(tx: Any) -> Any:
    alice = await create_user(tx.conn, "Alice", last_name="Martin")
    older = await create_formation(
        tx.conn,
        alice,
        title="Apprendre Python",
        last_opened_at=parse_iso("2026-11-01T08:00:00Z"),
    )
    newer = await create_formation(
        tx.conn,
        alice,
        title="Gestion de projet agile",
        last_opened_at=parse_iso("2026-11-10T08:00:00Z"),
    )
    validated = await create_module(tx.conn, newer, 1, status="validated")
    await create_module(tx.conn, newer, 2)
    await create_module(tx.conn, newer, 3, status="validated")
    chapter = await create_chapter(tx.conn, newer, validated)
    return alice, older, newer, chapter


async def test_header_abbreviates_the_address_and_counts(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", last_name="Martin")
        await create_formation(tx.conn, alice)
        await create_formation(tx.conn, alice, status="paused")
        await create_notification(tx.conn, alice)
        await create_notification(tx.conn, alice, read_at=FIXED)
        result = await get_header(deps_for(tx), actor_for(alice))
        HeaderGetOutput.model_validate(result)
        return result

    result = await rolled_back(database, scenario)
    assert result == {
        "firstName": "Alice",
        "lastName": "Martin",
        "emailLabel": "i***@test.learny.test",
        "activeFormationCount": 1,
        "unreadNotificationCount": 1,
    }


async def test_header_without_profile_is_not_found(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        with pytest.raises(AppError) as raised:
            await get_header(deps_for(tx), actor_for("11111111-1111-4111-8111-111111111111"))
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "NOT_FOUND"


async def test_sidebar_lists_the_formations_newest_first(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        alice, older, newer, _chapter = await workspace(tx)
        await set_current_formation(tx, alice, older)
        result = await get_sidebar(deps_for(tx), actor_for(alice))
        SidebarGetOutput.model_validate(result)
        return result, older, newer

    result, older, newer = await rolled_back(database, scenario)
    assert [formation["id"] for formation in result["formations"]] == [newer, older]
    assert result["currentFormation"]["id"] == older
    assert result["formations"][0]["monogram"] == "GE"
    assert result["formations"][0]["progressPercent"] == 67
    assert result["formations"][0]["moduleCount"] == 3
    assert result["collapsed"] is False


async def test_sidebar_falls_back_to_the_most_recent_active_formation(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        alice, _older, newer, _chapter = await workspace(tx)
        result = await get_sidebar(deps_for(tx), actor_for(alice))
        return result, newer

    result, newer = await rolled_back(database, scenario)
    assert result["currentFormation"]["id"] == newer


async def test_sidebar_never_renders_a_paused_formation_as_current(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        await create_formation(tx.conn, alice, title="En pause", status="paused")
        result = await get_sidebar(deps_for(tx), actor_for(alice))
        SidebarGetOutput.model_validate(result)
        return result

    result = await rolled_back(database, scenario)
    assert result["currentFormation"] is None
    assert [formation["status"] for formation in result["formations"]] == ["paused"]


async def test_sidebar_counts_due_reviews_and_open_gaps(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        alice, older, _newer, _chapter = await workspace(tx)
        module = await create_module(tx.conn, older, 1)
        chapter = await create_chapter(tx.conn, older, module)
        due = await create_notion(tx.conn, older, module, chapter, 1)
        await create_notion_state(
            tx.conn,
            alice,
            due,
            due_at=parse_iso("2026-11-10T12:00:00Z"),
            in_review=True,
        )
        future = await create_notion(tx.conn, older, module, chapter, 2)
        await create_notion_state(
            tx.conn,
            alice,
            future,
            due_at=parse_iso("2026-12-10T12:00:00Z"),
            in_review=True,
        )
        gap = await create_notion(tx.conn, older, module, chapter, 3)
        await create_notion_state(tx.conn, alice, gap, gap_nature="confusion")
        cleared = await create_notion(tx.conn, older, module, chapter, 4)
        await create_notion_state(
            tx.conn,
            alice,
            cleared,
            gap_nature="confusion",
            gap_cleared=True,
        )
        await set_current_formation(tx, alice, older)
        result = await get_sidebar(deps_for(tx), actor_for(alice))
        return result

    result = await rolled_back(database, scenario)
    assert result["quizDueCount"] == 1
    assert result["gapCount"] == 1


async def test_sidebar_streak_uses_the_learner_local_day(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        await create_daily_activity(tx.conn, alice, "2026-11-10", minutes=10)
        await create_daily_activity(tx.conn, alice, "2026-11-09", qualifying=True)
        await create_daily_activity(tx.conn, alice, "2026-11-08", minutes=0)
        await set_current_formation(tx, alice, None, streak_days=3)
        result = await get_sidebar(deps_for(tx), actor_for(alice))
        SidebarGetOutput.model_validate(result)
        return result

    result = await rolled_back(database, scenario)
    regularity = result["streak"]["regularity"]
    assert result["streak"]["days"] == 3
    assert len(regularity) == 14
    assert regularity[0]["date"] == "2026-10-29"
    assert regularity[13] == {"date": "2026-11-11", "status": "none"}
    statuses = {entry["date"]: entry["status"] for entry in regularity}
    assert statuses["2026-11-10"] == "done"
    assert statuses["2026-11-09"] == "done"
    assert statuses["2026-11-08"] == "none"


async def test_update_sidebar_persists_the_collapsed_state_and_the_current_formation(
    database: Database,
) -> None:
    async def scenario(tx: Any) -> Any:
        alice, older, _newer, _chapter = await workspace(tx)
        result = await update_sidebar(
            deps_for(tx),
            actor_for(alice),
            {"collapsed": True, "currentFormationId": older},
        )
        SidebarUpdateOutput.model_validate(result)
        stored = await one(
            tx.conn,
            "select sidebar_collapsed, current_formation_id::text as current "
            "from public.profiles where id = cast(:user as uuid)",
            user=alice,
        )
        return result, stored

    result, stored = await rolled_back(database, scenario)
    assert result["collapsed"] is True
    assert result["currentFormation"]["id"] == stored["current"]
    assert stored["sidebar_collapsed"] is True


async def test_update_sidebar_refuses_a_formation_of_another_owner(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        alice, _older, _newer, _chapter = await workspace(tx)
        bob = await create_user(tx.conn, "Bob")
        foreign = await create_formation(tx.conn, bob, title="Chez Bob")
        with pytest.raises(AppError) as raised:
            await update_sidebar(
                deps_for(tx),
                actor_for(alice),
                {"collapsed": True, "currentFormationId": foreign},
            )
        error = raised.value
        stored = await one(
            tx.conn,
            "select sidebar_collapsed from public.profiles where id = cast(:user as uuid)",
            user=alice,
        )
        return error, stored

    error, stored = await rolled_back(database, scenario)
    assert error.code == "NOT_FOUND"
    assert error.detail == FORMATION_NOT_FOUND
    assert stored["sidebar_collapsed"] is False


async def test_update_sidebar_selects_a_shared_formation(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        shared = await create_formation(tx.conn, bob, title="Partagee")
        group = await create_group(tx.conn, shared, bob, "LRN-CD34")
        await join_group(tx.conn, group, alice)
        result = await update_sidebar(
            deps_for(tx),
            actor_for(alice),
            {"currentFormationId": shared},
        )
        return result, shared

    result, shared = await rolled_back(database, scenario)
    assert result["currentFormation"]["id"] == shared
