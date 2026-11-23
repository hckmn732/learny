"""[SPEC-2201] Personal model assignment."""

import uuid
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    assign_task,
    create_credential,
    create_user,
    deps_for,
    one,
)
from learny.identity.application.ai_models import assign_task_model
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import CREDENTIAL_NOT_FOUND, MODEL_NOT_IN_CREDENTIAL
from learny_api.generated.models import MeAiTaskModelsUpdateOutput

pytestmark = pytest.mark.spec("SPEC-2201")


async def test_assign_task_model_writes_the_assignment(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        credential = await create_credential(tx.conn, user, ["gpt-x", "gpt-y"])
        body = {"task": "tutor", "credentialId": credential, "modelId": "gpt-y"}
        result = await assign_task_model(deps_for(tx), actor_for(user), body)
        MeAiTaskModelsUpdateOutput.model_validate(result)
        stored = await one(
            tx.conn,
            "select credential_id::text as credential, model_id from public.ai_task_models "
            "where user_id = cast(:user as uuid) and task = 'tutor'",
            user=user,
        )
        return result, stored

    result, stored = await rolled_back(database, scenario)
    assert result["task"] == "tutor"
    assert result["modelId"] == "gpt-y"
    assert stored["model_id"] == "gpt-y"
    assert stored["credential"] == result["credentialId"]


async def test_assign_task_model_replaces_the_previous_assignment(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        credential = await create_credential(tx.conn, user, ["gpt-x", "gpt-y"])
        await assign_task(tx.conn, user, "tutor", credential, "gpt-x")
        result = await assign_task_model(
            deps_for(tx),
            actor_for(user),
            {"task": "tutor", "credentialId": credential, "modelId": "gpt-y"},
        )
        return result

    result = await rolled_back(database, scenario)
    assert result["modelId"] == "gpt-y"


async def test_an_unknown_credential_is_not_found(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        with pytest.raises(AppError) as raised:
            await assign_task_model(
                deps_for(tx),
                actor_for(user),
                {"task": "tutor", "credentialId": str(uuid.uuid4()), "modelId": "gpt-x"},
            )
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "CREDENTIAL_NOT_FOUND"
    assert error.detail == CREDENTIAL_NOT_FOUND
    assert error.status == 404


async def test_a_model_outside_the_key_is_a_validation_failure(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Alice")
        credential = await create_credential(tx.conn, user, ["gpt-x"])
        with pytest.raises(AppError) as raised:
            await assign_task_model(
                deps_for(tx),
                actor_for(user),
                {"task": "tutor", "credentialId": credential, "modelId": "gpt-z"},
            )
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "VALIDATION_FAILED"
    assert error.status == 422
    assert error.detail == MODEL_NOT_IN_CREDENTIAL
    assert error.extra["errors"] == [{"path": "body.modelId", "message": MODEL_NOT_IN_CREDENTIAL}]


async def test_a_credential_of_another_learner_is_not_found(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        bob_credential = await create_credential(tx.conn, bob, ["gpt-x"])
        with pytest.raises(AppError) as raised:
            await assign_task_model(
                deps_for(tx),
                actor_for(alice),
                {"task": "tutor", "credentialId": bob_credential, "modelId": "gpt-x"},
            )
        return raised.value

    error = await rolled_back(database, scenario)
    assert error.code == "CREDENTIAL_NOT_FOUND"
