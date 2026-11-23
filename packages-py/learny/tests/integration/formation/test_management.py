"""[SPEC-2201] Formation management: access, pause, archive, current (formations/*.ts)."""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.formation_support import formation_deps
from factories.identity_support import (
    actor_for,
    create_formation,
    create_module,
    create_user,
    one,
)
from learny.formation.application import formations as service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import FORMATION_CANNOT_ARCHIVE, FORMATION_CHANGED
from learny_api.generated.models import (
    FormationsArchiveOutput,
    FormationsCurrentOutput,
    FormationsPauseOutput,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2201")


async def test_access_is_true_for_the_owner_and_false_for_a_foreign_id(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        formation_id = await create_formation(tx.conn, alice, status="active")
        deps = formation_deps(tx)
        owner = await service.can_access_formation(deps, actor_for(alice), formation_id)
        foreign = await service.can_access_formation(deps, actor_for(bob), formation_id)
        malformed = await service.can_access_formation(deps, actor_for(alice), "pas-un-uuid")
        return owner, foreign, malformed

    owner, foreign, malformed = await rolled_back(database, run)
    assert (owner, foreign, malformed) == (True, False, False)


async def test_pause_cancels_the_future_slots_and_moves_the_current_formation(
    database: Database,
) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        paused = await create_formation(tx.conn, alice, title="A", status="active", last_opened_at=None)
        other = await create_formation(tx.conn, alice, title="B", status="active")
        await create_module(tx.conn, paused, 1)
        await tx.conn.execute(
            text(
                "update public.profiles set current_formation_id = cast(:id as uuid) "
                "where id = cast(:user as uuid)"
            ),
            {"id": paused, "user": alice},
        )
        await tx.conn.execute(
            text(
                "insert into public.schedule_slots (user_id, formation_id, kind, title, starts_at, "
                "ends_at, status, created_by) values (cast(:user as uuid), cast(:formation as uuid), "
                "'course', 'Slot', '2026-11-20T09:00:00Z', '2026-11-20T10:00:00Z', 'planned', 'planner')"
            ),
            {"user": alice, "formation": paused},
        )
        deps = formation_deps(tx)
        state = await service.pause_formation(deps, actor_for(alice), paused, {})
        status = await one(
            tx.conn,
            "select status::text as status from public.formations where id = cast(:id as uuid)",
            id=paused,
        )
        slots = await one(
            tx.conn,
            "select count(*)::int as count from public.schedule_slots "
            "where formation_id = cast(:id as uuid) and status = 'cancelled'",
            id=paused,
        )
        current = await one(
            tx.conn,
            "select current_formation_id::text as id from public.profiles where id = cast(:user as uuid)",
            user=alice,
        )
        return state, status, slots, current, other

    state, status, slots, current, other = await rolled_back(database, run)
    parsed = FormationsPauseOutput.model_validate(state)
    assert parsed.outcome == "applied"
    assert status["status"] == "paused"
    assert slots["count"] == 1
    assert current["id"] == other
    assert parsed.state.activeCount == 1


async def test_archive_of_an_archived_formation_is_an_idempotent_no_op(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, status="archived")
        deps = formation_deps(tx)
        return await service.archive_formation(deps, actor_for(alice), formation_id, {})

    state = await rolled_back(database, run)
    parsed = FormationsArchiveOutput.model_validate(state)
    assert parsed.outcome == "unchanged"


async def test_archive_refuses_a_cadrage_and_a_stale_version(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        cadrage = await create_formation(tx.conn, alice, status="cadrage")
        active = await create_formation(tx.conn, alice, status="active")
        deps = formation_deps(tx)
        with pytest.raises(AppError) as refused:
            await service.archive_formation(deps, actor_for(alice), cadrage, {})
        with pytest.raises(AppError) as stale:
            await service.archive_formation(
                deps, actor_for(alice), active, {"expectedUpdatedAt": "2020-01-01T00:00:00.000Z"}
            )
        return refused.value, stale.value

    refused, stale = await rolled_back(database, run)
    assert refused.code == "CONFLICT"
    assert refused.detail == FORMATION_CANNOT_ARCHIVE
    assert stale.code == "CONFLICT"
    assert stale.detail == FORMATION_CHANGED


async def test_switch_current_requires_an_active_formation(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        paused = await create_formation(tx.conn, alice, status="paused")
        active = await create_formation(tx.conn, alice, status="active")
        deps = formation_deps(tx)
        with pytest.raises(AppError) as refused:
            await service.switch_current_formation(deps, actor_for(alice), {"formationId": paused})
        state = await service.switch_current_formation(deps, actor_for(alice), {"formationId": active})
        return refused.value, state

    refused, state = await rolled_back(database, run)
    assert refused.code == "CONFLICT"
    parsed = FormationsCurrentOutput.model_validate(state)
    assert parsed.currentFormationId is not None
    assert parsed.activeCount == 1
