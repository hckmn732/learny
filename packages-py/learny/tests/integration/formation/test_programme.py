"""[SPEC-2201] Programme: creation, scoping turn, generation and validation (programme/*.ts)."""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.formation_support import create_message, formation_deps
from factories.identity_support import actor_for, create_formation, create_user, one
from learny.formation.application import cadrage as cadrage_service
from learny.formation.application import programme as service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import PROGRAMME_STALE
from learny_api.generated.models import (
    CadrageMessageOutput,
    FormationsCreateOutput,
    ProgrammeGenerateOutput,
    ProgrammeValidateOutput,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2201")


async def test_create_formation_plays_the_first_scoping_turn(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        deps = formation_deps(tx)
        created = await cadrage_service.create_formation(
            deps, actor_for(alice), {"title": "SAP S/4HANA Finance"}
        )
        return created

    created = await rolled_back(database, run)
    parsed = FormationsCreateOutput.model_validate(created)
    assert parsed.formation.status == "cadrage"
    assert parsed.cadrage.questionsAsked == 1
    assert parsed.cadrage.messages[-1].role == "tutor"
    assert parsed.cadrage.messages[-1].questionNumber == 1
    assert parsed.cadrage.pendingQuestion is not None
    assert parsed.cadrage.error is None


async def test_learner_message_is_stored_and_answered(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="cadrage")
        await create_message(
            tx.conn,
            formation_id,
            alice,
            role="tutor",
            content="What is the scope?",
            question_key="scope",
            suggestions=[{"label": "Finance", "value": "finance", "multi": False}],
            position=1,
        )
        deps = formation_deps(tx)
        state = await cadrage_service.post_cadrage_message(
            deps, actor_for(alice), formation_id, {"content": "Le module FI"}
        )
        return state

    state = await rolled_back(database, run)
    parsed = CadrageMessageOutput.model_validate(state)
    assert [message.role for message in parsed.messages] == [
        "tutor",
        "learner",
        "tutor",
    ]
    assert parsed.messages[1].content == "Le module FI"
    assert parsed.questionsAsked == 2


async def test_stale_selection_is_refused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="cadrage")
        deps = formation_deps(tx)
        with pytest.raises(AppError) as failure:
            await cadrage_service.post_cadrage_message(
                deps, actor_for(alice), formation_id, {"selections": ["finance"]}
            )
        return failure.value

    error = await rolled_back(database, run)
    assert error.code == "VALIDATION_FAILED"
    assert error.status == 400


async def test_generate_then_validate_activates_the_formation(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="cadrage")
        await tx.conn.execute(
            text(
                'update public.formations set cadrage_profile = \'{"scope": '
                '{"value": "FI", "state": "done"}}\'::jsonb '
                "where id = cast(:id as uuid)"
            ),
            {"id": formation_id},
        )
        await tx.conn.execute(
            text(
                "insert into public.event_outbox (event_id, name, data, user_id) "
                "values (:id, 'formation/cadrage-completed', '{}'::jsonb, cast(:user as uuid))"
            ),
            {"id": f"cadrage-completed:{formation_id}", "user": alice},
        )
        deps = formation_deps(tx)
        generated = await service.generate_proposal(
            deps, actor_for(alice), formation_id, {"expectedVersion": 0}
        )
        validated = await service.validate_proposal(
            deps, actor_for(alice), formation_id, {"expectedVersion": 1}
        )
        status = await one(
            tx.conn,
            "select status::text as status from public.formations where id = cast(:id as uuid)",
            id=formation_id,
        )
        modules = await one(
            tx.conn,
            "select count(*)::int as count from public.modules where formation_id = cast(:id as uuid)",
            id=formation_id,
        )
        event = await one(
            tx.conn,
            "select data from public.event_outbox where event_id = :id",
            id=f"programme-validated:{formation_id}",
        )
        return generated, validated, status, modules, event

    generated, validated, status, modules, event = await rolled_back(database, run)
    proposal = ProgrammeGenerateOutput.model_validate(generated)
    assert proposal.proposal is not None
    assert proposal.proposal.version == 1
    assert proposal.proposal.source == "generated"
    assert proposal.proposal.modules[0].position == 1
    active = ProgrammeValidateOutput.model_validate(validated)
    assert active.proposal is not None
    assert active.proposal.proposalStatus == "active"
    assert active.formationStatus == "active"
    assert status["status"] == "active"
    assert modules["count"] >= 1
    assert event["data"]["formationId"] is not None


async def test_validate_with_a_stale_version_is_refused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="cadrage")
        deps = formation_deps(tx)
        with pytest.raises(AppError) as failure:
            await service.validate_proposal(deps, actor_for(alice), formation_id, {"expectedVersion": 3})
        return failure.value

    error = await rolled_back(database, run)
    assert error.code == "CONFLICT"
    assert error.status == 409
    assert error.detail == PROGRAMME_STALE
