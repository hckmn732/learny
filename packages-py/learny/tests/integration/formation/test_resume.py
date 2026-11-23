"""[SPEC-2207] The resume of a formation served by Python (`formations/resume.ts`).

The resume is one transaction: the paused formation becomes active, the planner of SPEC-407
recreates its future slots from the learner's local day, and the limit of three active formations
answers `limit` without writing anything (SPEC-618 EF-2, EF-3, ET-3; BR-FOR-10).
"""

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
from learny.shared.locale_fr.details import (
    FORMATION_CANNOT_RESUME,
    FORMATION_PAUSE_CHOICE_STALE,
)
from learny_api.generated.models import FormationsResumeOutput

pytestmark = pytest.mark.spec("SPEC-2207")


async def formation_status(conn: Any, formation_id: str) -> str:
    row = await one(
        conn,
        "select status::text as status from public.formations where id = cast(:id as uuid)",
        id=formation_id,
    )
    return str(row["status"])


async def planned_slots(conn: Any, formation_id: str) -> int:
    row = await one(
        conn,
        "select count(*)::int as count from public.schedule_slots "
        "where formation_id = cast(:id as uuid) and status = 'planned'",
        id=formation_id,
    )
    return int(row["count"])


async def outbox_count(conn: Any, user_id: str, name: str) -> int:
    row = await one(
        conn,
        "select count(*)::int as count from public.event_outbox "
        "where user_id = cast(:user as uuid) and name = :name",
        user=user_id,
        name=name,
    )
    return int(row["count"])


async def test_resume_replans_the_formation_from_the_local_day(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, status="paused")
        await create_module(tx.conn, formation_id, 1)
        await create_module(tx.conn, formation_id, 2)
        state = await service.resume_formation(formation_deps(tx), actor_for(alice), formation_id, {})
        return (
            state,
            await formation_status(tx.conn, formation_id),
            await planned_slots(tx.conn, formation_id),
            await one(
                tx.conn,
                "select current_formation_id::text as id from public.profiles where id = cast(:user as uuid)",
                user=alice,
            ),
            await outbox_count(tx.conn, alice, "formation/resumed"),
        )

    state, status, slots, current, events = await rolled_back(database, run)
    parsed = FormationsResumeOutput.model_validate(state)
    assert parsed.outcome == "applied"
    assert parsed.pausedFormationId is None
    assert status == "active"
    assert slots > 0
    assert current["id"] is not None
    assert events == 1


async def test_resume_of_an_active_formation_is_an_idempotent_no_op(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, status="active")
        return await service.resume_formation(formation_deps(tx), actor_for(alice), formation_id, {})

    state = await rolled_back(database, run)
    assert FormationsResumeOutput.model_validate(state).outcome == "unchanged"


async def test_resume_refuses_a_formation_that_cannot_be_resumed(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        cadrage = await create_formation(tx.conn, alice, status="cadrage")
        with pytest.raises(AppError) as refused:
            await service.resume_formation(formation_deps(tx), actor_for(alice), cadrage, {})
        return refused.value

    error = await rolled_back(database, run)
    assert error.code == "CONFLICT"
    assert error.detail == FORMATION_CANNOT_RESUME


async def test_the_limit_answers_limit_and_writes_nothing(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        for title in ("A", "B", "C"):
            await create_formation(tx.conn, alice, title=title, status="active")
        target = await create_formation(tx.conn, alice, title="D", status="paused")
        await create_module(tx.conn, target, 1)
        state = await service.resume_formation(formation_deps(tx), actor_for(alice), target, {})
        return state, await formation_status(tx.conn, target)

    state, status = await rolled_back(database, run)
    parsed = FormationsResumeOutput.model_validate(state)
    assert parsed.outcome == "limit"
    assert parsed.state.activeCount == 3
    assert status == "paused"


async def test_resume_pauses_the_chosen_formation_and_emits_both_events(
    database: Database,
) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        chosen = await create_formation(tx.conn, alice, title="A", status="active")
        await create_formation(tx.conn, alice, title="B", status="active")
        await create_formation(tx.conn, alice, title="C", status="active")
        target = await create_formation(tx.conn, alice, title="D", status="paused")
        await create_module(tx.conn, target, 1)
        state = await service.resume_formation(
            formation_deps(tx), actor_for(alice), target, {"pauseFormationId": chosen}
        )
        return (
            state,
            await formation_status(tx.conn, chosen),
            await formation_status(tx.conn, target),
            await outbox_count(tx.conn, alice, "formation/paused"),
            await outbox_count(tx.conn, alice, "formation/resumed"),
        )

    state, chosen_status, target_status, paused_events, resumed_events = await rolled_back(database, run)
    parsed = FormationsResumeOutput.model_validate(state)
    assert parsed.outcome == "applied"
    assert parsed.pausedFormationId is not None
    assert chosen_status == "paused"
    assert target_status == "active"
    assert (paused_events, resumed_events) == (1, 1)


async def test_resume_refuses_a_choice_that_is_no_longer_active(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        for title in ("A", "B", "C"):
            await create_formation(tx.conn, alice, title=title, status="active")
        paused = await create_formation(tx.conn, alice, title="P", status="paused")
        target = await create_formation(tx.conn, alice, title="D", status="paused")
        with pytest.raises(AppError) as stale:
            await service.resume_formation(
                formation_deps(tx), actor_for(alice), target, {"pauseFormationId": paused}
            )
        return stale.value

    error = await rolled_back(database, run)
    assert error.code == "CONFLICT"
    assert error.detail == FORMATION_PAUSE_CHOICE_STALE
