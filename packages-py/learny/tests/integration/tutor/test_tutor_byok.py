"""[SPEC-2204] Personal AI keys: BYOK creation, RLS, qualification and the models tab.

Ported from `packages/services/src/ai/credentials-service.test.ts`,
`packages/services/src/ai/qualify-model.test.ts` (the route-reachable part),
`apps/api/test/integration/ai-credentials-routes.test.ts`, `ai-qualify-route.test.ts` and
`spec-709-routes.test.ts`: the seeded rows replace the fakes, every read runs as the authenticated
learner under RLS, and the model is the committed mock adapter (ADR-0048).
"""

import json
from typing import Any

import pytest
from factories.byok_support import (
    FAKE_API_KEY,
    FAKE_BARE_KEY,
    FAKE_ENCRYPTION_KEY,
    FAKE_PREFIXED_KEY,
    assignment_rows,
    count_credentials,
    create_assignment_row,
    create_credential_row,
    create_learner,
    credential_row,
)
from factories.db_support import rolled_back
from factories.identity_support import FIXED, actor_for
from factories.tutor_support import tutor_deps
from learny.platform.llm.catalog import provider_region
from learny.platform.llm.credentials import (
    MASK_BULLETS,
    credential_aad,
    decrypt_secret,
    load_keyring,
)
from learny.platform.llm.discovery import mock_models
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import ai as texts
from learny.shared.locale_fr.details import CREDENTIAL_NOT_FOUND, MODEL_NOT_IN_CREDENTIAL
from learny.shared.time import to_iso
from learny.tutor.application.byok import (
    create_credential,
    delete_credential,
    discover_credential_models,
    get_models_state,
    list_credentials,
    qualify_credential,
    update_models,
)

pytestmark = pytest.mark.spec("SPEC-2204")

MODEL = "gpt-5-mini"
CREATED_AT = to_iso(FIXED)


@pytest.fixture(autouse=True)
def master_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """The BYOK envelope needs a master key; the value is a dummy of the tests."""
    monkeypatch.setenv("APP_ENCRYPTION_KEY", FAKE_ENCRYPTION_KEY)
    monkeypatch.delenv("ALLOW_LOCAL_MODELS", raising=False)


def openai_body(**overrides: Any) -> dict[str, Any]:
    """The creation body of the route tests, with the dummy key."""
    return {"provider": "openai", "modelIds": [MODEL], "apiKey": FAKE_API_KEY, **overrides}


async def test_a_created_key_is_masked_and_the_ciphertext_round_trips(database: Database) -> None:
    async def run(tx: Tx) -> tuple[str, dict[str, Any]]:
        user = await create_learner(tx)
        dto = await create_credential(tutor_deps(tx), actor_for(user), openai_body())
        return user, dto

    _, dto = await rolled_back(database, run)
    region = provider_region("openai")
    assert dto["provider"] == "openai"
    assert dto["providerLabel"] == region.provider_label
    assert dto["label"] == region.default_label
    assert dto["keyMasked"] == f"sk-{MASK_BULLETS}{FAKE_API_KEY[-4:]}"
    assert dto["status"] == "untested"
    assert dto["connectionStatus"] == "connected"
    assert dto["outsideEu"] is True
    assert dto["dataNote"] == region.data_note
    assert dto["baseUrl"] is None
    assert dto["modelIds"] == [MODEL]
    assert dto["qualifiedAt"] is None
    assert dto["createdAt"] == CREATED_AT
    serialised = json.dumps(dto)
    assert FAKE_API_KEY not in serialised
    assert "apiKey" not in dto
    assert "encryptedKey" not in dto


async def test_the_stored_key_is_encrypted_with_the_row_envelope(database: Database) -> None:
    async def run(tx: Tx) -> tuple[str, str, dict[str, Any]]:
        user = await create_learner(tx)
        dto = await create_credential(tutor_deps(tx), actor_for(user), openai_body())
        row = await credential_row(tx, str(dto["id"]))
        return user, str(dto["id"]), row

    user, credential_id, row = await rolled_back(database, run)
    ring = load_keyring({"APP_ENCRYPTION_KEY": FAKE_ENCRYPTION_KEY})
    plain, used_previous = decrypt_secret(
        bytes(row["encrypted_key"]), credential_aad(credential_id, user), ring
    )
    assert plain == FAKE_API_KEY
    assert used_previous is False
    assert row["key_last4"] == FAKE_API_KEY[-4:]
    qualification = row["qualification"]
    assert qualification["keyPrefix"] == "sk"
    assert len(qualification["keyFingerprint"]) == 64
    assert qualification["connection"]["status"] == "connected"
    assert qualification["connection"]["modelId"] == MODEL
    assert qualification["connection"]["checkedAt"] == CREATED_AT
    assert qualification["connection"]["durationMs"] == 0


async def test_the_same_key_twice_is_a_conflict(database: Database) -> None:
    async def run(tx: Tx) -> None:
        user = await create_learner(tx)
        deps = tutor_deps(tx)
        actor = actor_for(user)
        await create_credential(deps, actor, openai_body())
        await create_credential(deps, actor, openai_body())

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "CONFLICT"
    assert error.value.status == 409
    assert error.value.detail == texts.CREDENTIAL_DUPLICATE


async def test_the_eleventh_key_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> None:
        user = await create_learner(tx)
        for index in range(10):
            await create_credential_row(tx, user_id=user, label=f"Cle {index}")
        await create_credential(tutor_deps(tx), actor_for(user), openai_body())

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "CREDENTIAL_LIMIT_REACHED"
    assert error.value.detail == texts.CREDENTIAL_LIMIT_REACHED


async def test_a_local_model_needs_the_environment_switch(
    database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def refused(tx: Tx) -> None:
        user = await create_learner(tx)
        await create_credential(
            tutor_deps(tx),
            actor_for(user),
            {"provider": "local", "modelIds": ["llama3.2:3b"], "baseUrl": "http://localhost:11434/v1"},
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, refused)
    assert error.value.code == "LOCAL_MODELS_DISABLED"
    assert error.value.detail == texts.LOCAL_MODELS_DISABLED

    monkeypatch.setenv("ALLOW_LOCAL_MODELS", "true")

    async def accepted(tx: Tx) -> dict[str, Any]:
        user = await create_learner(tx)
        return await create_credential(
            tutor_deps(tx),
            actor_for(user),
            {"provider": "local", "modelIds": ["llama3.2:3b"], "baseUrl": "http://localhost:11434/v1"},
        )

    dto = await rolled_back(database, accepted)
    assert dto["provider"] == "local"
    assert dto["keyMasked"] is None
    assert dto["outsideEu"] is False
    assert dto["baseUrl"] == "http://localhost:11434/v1"


async def test_a_creation_without_a_key_or_with_a_custom_url_of_a_known_provider_is_refused(
    database: Database,
) -> None:
    async def missing_key(tx: Tx) -> None:
        user = await create_learner(tx)
        await create_credential(
            tutor_deps(tx),
            actor_for(user),
            {"provider": "openai", "modelIds": [MODEL]},
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, missing_key)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.status == 422
    assert error.value.extra["errors"] == [{"path": "body.apiKey", "message": texts.API_KEY_REQUIRED}]

    async def custom_url(tx: Tx) -> None:
        user = await create_learner(tx)
        await create_credential(
            tutor_deps(tx),
            actor_for(user),
            openai_body(baseUrl="https://api.example.com"),
        )

    with pytest.raises(AppError) as refused:
        await rolled_back(database, custom_url)
    assert refused.value.code == "VALIDATION_FAILED"
    assert refused.value.extra["errors"] == [{"path": "body.baseUrl", "message": texts.BASE_URL_NOT_ALLOWED}]


async def test_a_private_compatible_endpoint_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> None:
        user = await create_learner(tx)
        await create_credential(
            tutor_deps(tx),
            actor_for(user),
            {
                "provider": "openai_compatible",
                "modelIds": [MODEL],
                "apiKey": FAKE_API_KEY,
                "baseUrl": "https://169.254.169.254/v1",
            },
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "URL_BLOCKED_HOST"


async def test_the_list_is_scoped_to_the_caller_and_oldest_first(database: Database) -> None:
    async def run(tx: Tx) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
        alice = await create_learner(tx, "Alice")
        bob = await create_learner(tx, "Bob")
        await create_credential_row(tx, user_id=alice, label="Premiere")
        await create_credential_row(tx, user_id=alice, label="Seconde")
        await create_credential_row(tx, user_id=bob, label="Autre")
        own = await list_credentials(tutor_deps(tx), actor_for(alice))
        foreign = await list_credentials(tutor_deps(tx), actor_for(bob))
        return own, foreign, await count_credentials(tx, alice)

    own, foreign, total = await rolled_back(database, run)
    assert [entry["label"] for entry in own] == ["Premiere", "Seconde"]
    assert len(foreign) == 1
    assert foreign[0]["label"] == "Autre"
    assert total == 2
    assert all(entry["keyMasked"] == f"{MASK_BULLETS}a91F" for entry in own)


async def test_a_key_without_an_alphabetic_prefix_is_masked_with_bullets_only(
    database: Database,
) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        user = await create_learner(tx)
        return await create_credential(tutor_deps(tx), actor_for(user), openai_body(apiKey=FAKE_BARE_KEY))

    dto = await rolled_back(database, run)
    assert dto["keyMasked"] == f"{MASK_BULLETS}{FAKE_BARE_KEY[-4:]}"


async def test_a_prefixed_key_keeps_its_prefix(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        user = await create_learner(tx)
        return await create_credential(tutor_deps(tx), actor_for(user), openai_body(apiKey=FAKE_PREFIXED_KEY))

    dto = await rolled_back(database, run)
    assert dto["keyMasked"] == f"sk-{MASK_BULLETS}{FAKE_PREFIXED_KEY[-4:]}"


async def test_a_foreign_key_cannot_be_deleted_and_the_owner_removes_its_assignments(
    database: Database,
) -> None:
    async def run(tx: Tx) -> tuple[str, str]:
        alice = await create_learner(tx, "Alice")
        credential_id = await create_credential_row(tx, user_id=alice, model_ids=(MODEL,))
        await create_assignment_row(
            tx, user_id=alice, task="tutor", credential_id=credential_id, model_id=MODEL
        )
        return alice, credential_id

    async def refuse(tx: Tx) -> None:
        _, credential_id = await run(tx)
        carol = await create_learner(tx, "Carol")
        await delete_credential(tutor_deps(tx), actor_for(carol), credential_id)

    with pytest.raises(AppError) as error:
        await rolled_back(database, refuse)
    assert error.value.code == "NOT_FOUND"

    async def delete(tx: Tx) -> tuple[int, list[dict[str, Any]]]:
        alice, credential_id = await run(tx)
        await delete_credential(tutor_deps(tx), actor_for(alice), credential_id)
        return await count_credentials(tx, alice), await assignment_rows(tx, alice)

    remaining, assignments = await rolled_back(database, delete)
    assert remaining == 0
    assert assignments == []


async def test_a_malformed_identifier_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> None:
        user = await create_learner(tx)
        await delete_credential(tutor_deps(tx), actor_for(user), "pas-un-uuid")

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.CREDENTIAL_ID_NOT_FOUND


async def test_the_discovery_answers_the_simulated_catalogue(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        user = await create_learner(tx)
        return await discover_credential_models(
            tutor_deps(tx), actor_for(user), {"provider": "openai", "apiKey": FAKE_API_KEY}
        )

    answer = await rolled_back(database, run)
    assert answer == {"modelIds": mock_models("openai")}


async def test_the_discovery_requires_the_key_and_the_endpoint_of_its_provider(
    database: Database,
) -> None:
    async def missing_key(tx: Tx) -> None:
        user = await create_learner(tx)
        await discover_credential_models(tutor_deps(tx), actor_for(user), {"provider": "openai"})

    with pytest.raises(AppError) as error:
        await rolled_back(database, missing_key)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.extra["errors"] == [{"path": "body.apiKey", "message": texts.API_KEY_REQUIRED}]

    async def missing_url(tx: Tx) -> None:
        user = await create_learner(tx)
        await discover_credential_models(tutor_deps(tx), actor_for(user), {"provider": "local"})

    with pytest.raises(AppError) as refused:
        await rolled_back(database, missing_url)
    assert refused.value.extra["errors"] == [{"path": "body.baseUrl", "message": texts.BASE_URL_REQUIRED}]


async def test_the_connection_probe_qualifies_the_key_and_dates_it(database: Database) -> None:
    async def run(tx: Tx) -> tuple[dict[str, Any], dict[str, Any]]:
        user = await create_learner(tx)
        credential_id = await create_credential_row(tx, user_id=user, model_ids=(MODEL,))
        report = await qualify_credential(tutor_deps(tx), actor_for(user), credential_id, MODEL)
        return report, await credential_row(tx, credential_id)

    report, row = await rolled_back(database, run)
    assert report["status"] == "connected"
    assert report["modelId"] == MODEL
    assert report["checkedAt"] == CREATED_AT
    assert report["durationMs"] == 0
    assert "steps" not in report
    assert "bricks" not in report
    assert row["status"] == "qualified"
    assert to_iso(row["qualified_at"]) == CREATED_AT
    assert row["qualification"]["connection"]["status"] == "connected"


async def test_a_task_probe_reports_the_required_capabilities(database: Database) -> None:
    async def run(tx: Tx) -> tuple[dict[str, Any], dict[str, Any]]:
        user = await create_learner(tx)
        credential_id = await create_credential_row(tx, user_id=user, model_ids=(MODEL,))
        report = await qualify_credential(tutor_deps(tx), actor_for(user), credential_id, MODEL, task="tutor")
        return report, await credential_row(tx, credential_id)

    report, row = await rolled_back(database, run)
    assert report["status"] == "compatible"
    assert report["task"] == "tutor"
    assert report["requiredCapabilities"] == ["tools", "structured"]
    assert report["reserveCodes"] == []
    assert report["reasons"] == []
    assert report["checkedAt"] == CREATED_AT
    stored = row["qualification"]["compatibilities"]
    assert list(stored) == [f"{row['id']}:{MODEL}:tutor"]
    assert stored[f"{row['id']}:{MODEL}:tutor"]["status"] == "compatible"
    assert row["status"] == "untested"


async def test_a_foreign_key_cannot_be_qualified(database: Database) -> None:
    async def run(tx: Tx) -> None:
        alice = await create_learner(tx, "Alice")
        bob = await create_learner(tx, "Bob")
        credential_id = await create_credential_row(tx, user_id=alice, model_ids=(MODEL,))
        await qualify_credential(tutor_deps(tx), actor_for(bob), credential_id, MODEL)

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "CREDENTIAL_NOT_FOUND"
    assert error.value.status == 404
    assert error.value.detail == CREDENTIAL_NOT_FOUND
    assert "steps" not in error.value.extra


async def test_a_model_outside_the_key_is_refused_before_any_call(database: Database) -> None:
    async def run(tx: Tx) -> None:
        user = await create_learner(tx)
        credential_id = await create_credential_row(tx, user_id=user, model_ids=(MODEL,))
        await qualify_credential(tutor_deps(tx), actor_for(user), credential_id, "not-registered")

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.status == 422
    assert error.value.extra["errors"] == [{"path": "body.modelId", "message": MODEL_NOT_IN_CREDENTIAL}]


async def test_a_malformed_credential_identifier_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> None:
        user = await create_learner(tx)
        await qualify_credential(tutor_deps(tx), actor_for(user), "pas-un-uuid", MODEL)

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "CREDENTIAL_NOT_FOUND"


async def test_a_blank_model_identifier_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> None:
        user = await create_learner(tx)
        credential_id = await create_credential_row(tx, user_id=user, model_ids=(MODEL,))
        await qualify_credential(tutor_deps(tx), actor_for(user), credential_id, " ")

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.extra["errors"] == [{"path": "body.modelId", "message": texts.MODEL_ID_INVALID}]


async def test_the_models_tab_reads_the_five_tasks_and_the_masked_card(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        user = await create_learner(tx)
        await create_credential(tutor_deps(tx), actor_for(user), openai_body())
        return await get_models_state(tutor_deps(tx), actor_for(user))

    state = await rolled_back(database, run)
    assert [task["task"] for task in state["tasks"]] == [
        "programme",
        "course",
        "gaps",
        "tutor",
        "light",
    ]
    assert all(task["modelId"] is None for task in state["tasks"])
    assert all(task["available"] is False for task in state["tasks"])
    assert all(task["unavailableReason"] == "no_model_selected" for task in state["tasks"])
    assert len(state["providers"]) == 1
    card = state["providers"][0]
    assert card["keyMasked"] == f"sk-{MASK_BULLETS}{FAKE_API_KEY[-4:]}"
    assert card["status"] == "unqualified"
    assert card["models"] == [MODEL]
    assert card["failure"] is None
    assert state["updatedAt"] == CREATED_AT
    serialised = json.dumps(state)
    assert FAKE_API_KEY not in serialised
    assert "encrypted" not in serialised


async def test_an_assignment_is_immediate_then_cleared(database: Database) -> None:
    async def run(
        tx: Tx,
    ) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
        user = await create_learner(tx)
        deps = tutor_deps(tx)
        actor = actor_for(user)
        dto = await create_credential(deps, actor, openai_body())
        assigned = await update_models(
            deps,
            actor,
            {"action": "assign", "task": "tutor", "credentialId": dto["id"], "modelId": MODEL},
        )
        rows = await assignment_rows(tx, user)
        cleared = await update_models(deps, actor, {"action": "clear", "task": "tutor"})
        return assigned, rows, cleared, await assignment_rows(tx, user)

    assigned, rows, cleared, remaining = await rolled_back(database, run)
    tutor = next(task for task in assigned["tasks"] if task["task"] == "tutor")
    assert tutor["modelId"] == MODEL
    assert tutor["available"] is True
    assert tutor["provider"] == "openai"
    assert tutor["compatibility"]["status"] == "pending"
    assert [(row["task"], row["model_id"]) for row in rows] == [("tutor", MODEL)]
    assert next(task for task in cleared["tasks"] if task["task"] == "tutor")["modelId"] is None
    assert remaining == []


async def test_a_qualified_task_carries_its_stored_compatibility(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        user = await create_learner(tx)
        deps = tutor_deps(tx)
        actor = actor_for(user)
        dto = await create_credential(deps, actor, openai_body())
        await update_models(
            deps,
            actor,
            {"action": "assign", "task": "tutor", "credentialId": dto["id"], "modelId": MODEL},
        )
        await qualify_credential(deps, actor, str(dto["id"]), MODEL, task="tutor")
        return await get_models_state(deps, actor)

    state = await rolled_back(database, run)
    tutor = next(task for task in state["tasks"] if task["task"] == "tutor")
    assert tutor["compatibility"]["status"] == "compatible"
    assert tutor["compatibility"]["requiredCapabilities"] == ["tools", "structured"]


async def test_a_foreign_key_cannot_be_assigned(database: Database) -> None:
    async def run(tx: Tx) -> None:
        alice = await create_learner(tx, "Alice")
        bob = await create_learner(tx, "Bob")
        credential_id = await create_credential_row(tx, user_id=alice, model_ids=(MODEL,))
        await update_models(
            tutor_deps(tx),
            actor_for(bob),
            {"action": "assign", "task": "tutor", "credentialId": credential_id, "modelId": MODEL},
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, run)
    assert error.value.code == "NOT_FOUND"
    assert error.value.detail == texts.MODEL_NOT_FOUND


async def test_a_model_outside_the_key_and_a_blank_model_are_refused(database: Database) -> None:
    async def outside(tx: Tx) -> None:
        user = await create_learner(tx)
        credential_id = await create_credential_row(tx, user_id=user, model_ids=(MODEL,))
        await update_models(
            tutor_deps(tx),
            actor_for(user),
            {
                "action": "assign",
                "task": "tutor",
                "credentialId": credential_id,
                "modelId": "not-registered",
            },
        )

    with pytest.raises(AppError) as error:
        await rolled_back(database, outside)
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.status == 400
    assert error.value.extra["errors"] == [{"path": "body.modelId", "message": MODEL_NOT_IN_CREDENTIAL}]

    async def blank(tx: Tx) -> None:
        user = await create_learner(tx)
        await update_models(
            tutor_deps(tx),
            actor_for(user),
            {"action": "assign", "task": "tutor", "modelId": "   "},
        )

    with pytest.raises(AppError) as refused:
        await rolled_back(database, blank)
    assert refused.value.code == "VALIDATION_FAILED"
    assert refused.value.status == 400
    assert refused.value.extra["errors"][0]["path"] == "body.modelId"


async def test_a_deleted_key_leaves_its_tasks_unavailable_without_falling_back(
    database: Database,
) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        user = await create_learner(tx)
        await create_assignment_row(tx, user_id=user, task="tutor", credential_id=None, model_id=MODEL)
        return await get_models_state(tutor_deps(tx), actor_for(user))

    state = await rolled_back(database, run)
    tutor = next(task for task in state["tasks"] if task["task"] == "tutor")
    assert tutor["modelId"] == MODEL
    assert tutor["credentialId"] is None
    assert tutor["available"] is False
    assert tutor["unavailableReason"] == "credential_not_qualified"
    assert tutor["providerLabel"] == texts.PERSONAL_MODEL_LABEL
