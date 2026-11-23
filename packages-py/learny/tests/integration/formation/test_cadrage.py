"""[SPEC-2201] Scoping chat: reads, creation and the concluded state."""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.formation_support import create_message, formation_deps
from factories.identity_support import actor_for, create_formation, create_user, one
from learny.formation.application import cadrage as service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import CADRAGE_ALREADY_COMPLETED, FORMATION_NOT_FOUND
from learny_api.generated.models import CadrageGetOutput, FormationsListOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2201")

PROFILE = {
    "scope": {"value": "SAP FI", "state": "done"},
    "starting_point": {"value": None, "state": "todo"},
    "target_level": {"value": "consultant", "state": "done"},
    "volume": {"value": None, "state": "todo"},
    "dates": {"value": None, "state": "todo"},
}


async def formation_with_profile(tx: Any, owner: str, status: str = "cadrage") -> str:
    formation_id = await create_formation(tx.conn, owner, title="SAP", status=status)
    await tx.conn.execute(
        text(
            "update public.formations set cadrage_profile = cast(:profile as jsonb) "
            "where id = cast(:id as uuid)"
        ),
        {"profile": __import__("json").dumps(PROFILE), "id": formation_id},
    )
    return formation_id


async def conversation(tx: Any, owner: str, formation_id: str) -> None:
    """One tutor question, then the learner answer that the state must project."""
    await create_message(
        tx.conn,
        formation_id,
        owner,
        role="tutor",
        content="What is the scope?",
        question_key="scope",
        position=1,
    )
    await create_message(tx.conn, formation_id, owner, role="learner", content="SAP FI", position=2)


async def test_cadrage_state_projects_the_five_rubrics(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await formation_with_profile(tx, alice)
        await conversation(tx, alice, formation_id)
        deps = formation_deps(tx)
        return await service.get_cadrage_state(deps, actor_for(alice), formation_id), formation_id

    state, formation_id = await rolled_back(database, run)
    parsed = CadrageGetOutput.model_validate(state)
    assert parsed.formationId == formation_id
    assert parsed.questionsAsked == 1
    assert parsed.canGenerate is True
    assert list(parsed.profile) == [
        "scope",
        "starting_point",
        "target_level",
        "volume",
        "dates",
    ]
    assert [message.role for message in parsed.messages] == ["tutor", "learner"]
    assert parsed.messages[0].questionNumber == 1
    assert parsed.messages[1].questionNumber is None
    assert parsed.pendingQuestion is None
    assert parsed.error is not None
    assert parsed.error.code == "AI_TASK_FAILED"


async def test_another_owner_is_a_missing_formation(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        formation_id = await formation_with_profile(tx, alice)
        deps = formation_deps(tx)
        with pytest.raises(AppError) as failure:
            await service.get_cadrage_state(deps, actor_for(bob), formation_id)
        return failure.value

    error = await rolled_back(database, run)
    assert error.code == "NOT_FOUND"
    assert error.detail == FORMATION_NOT_FOUND


async def test_list_returns_the_owner_formations_only(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        await create_formation(tx.conn, alice, title="A", status="active")
        await create_formation(tx.conn, bob, title="B", status="active")
        deps = formation_deps(tx)
        return await service.list_formations(deps, actor_for(alice))

    items = await rolled_back(database, run)
    parsed = FormationsListOutput.model_validate(items)
    assert [item.title for item in parsed.items] == ["A"]


async def test_update_title_derives_the_monogram(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="Ancien", status="active")
        deps = formation_deps(tx)
        summary = await service.update_formation_title(
            deps, actor_for(alice), formation_id, {"title": "Ecologie urbaine"}
        )
        row = await one(
            tx.conn,
            "select monogram from public.formations where id = cast(:id as uuid)",
            id=formation_id,
        )
        return summary, row

    summary, row = await rolled_back(database, run)
    assert summary["title"] == "Ecologie urbaine"
    assert row["monogram"] == "EC"


async def test_complete_freezes_the_profile_and_refuses_a_second_click(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await formation_with_profile(tx, alice)
        deps = formation_deps(tx)
        first = await service.complete_cadrage(deps, actor_for(alice), formation_id)
        with pytest.raises(AppError) as failure:
            await service.complete_cadrage(deps, actor_for(alice), formation_id)
        event = await one(
            tx.conn,
            "select name, data from public.event_outbox where event_id = :id",
            id=f"cadrage-completed:{formation_id}",
        )
        status = await one(
            tx.conn,
            "select status::text as status, objectives::text[] as objectives "
            "from public.formations where id = cast(:id as uuid)",
            id=formation_id,
        )
        return first, failure.value, event, status

    first, error, event, status = await rolled_back(database, run)
    assert first == {"formationId": event["data"]["formationId"]}
    assert event["name"] == "formation/cadrage-completed"
    assert error.code == "CONFLICT"
    assert error.status == 409
    assert error.detail == CADRAGE_ALREADY_COMPLETED
    assert status["status"] == "cadrage"
    assert status["objectives"] == ["operational"]
