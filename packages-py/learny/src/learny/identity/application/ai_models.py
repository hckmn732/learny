"""Assignment of a personal model to an AI task (SPEC-505 ET-4; SPEC-2201).

Port of `assignTaskModel` (`packages/services/src/ai/qualify-model.ts`): the credential must belong
to the learner and the model must be one of the models of that key; the assignment is immediate.
"""

from collections.abc import Mapping
from typing import Any

from learny.identity.application.ports import IdentityDeps
from learny.identity.domain.actor import Actor
from learny.identity.infrastructure import queries
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    CREDENTIAL_NOT_FOUND,
    MODEL_NOT_IN_CREDENTIAL,
)


async def assign_task_model(
    deps: IdentityDeps,
    actor: Actor,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """`PUT /api/v1/me/ai/task-models` - assigns one model of a personal key to one task."""
    credential_id = str(body["credentialId"])
    task = str(body["task"])
    model_id = str(body["modelId"]).strip()
    async with deps.db.user_tx(actor) as tx:
        models = await queries.read_credential_models(tx, actor.user_id, credential_id)
        if models is None:
            raise AppError("CREDENTIAL_NOT_FOUND", CREDENTIAL_NOT_FOUND, status=404)
        if model_id not in models:
            raise AppError(
                "VALIDATION_FAILED",
                MODEL_NOT_IN_CREDENTIAL,
                status=422,
                errors=[{"path": "body.modelId", "message": MODEL_NOT_IN_CREDENTIAL}],
            )
        await queries.upsert_task_model(tx, actor.user_id, task, credential_id, model_id)
        return {"task": task, "credentialId": credential_id, "modelId": model_id}
