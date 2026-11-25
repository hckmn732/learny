"""Personal AI keys and the " Modeles d'IA " tab (SPEC-2204).

Ports (route-reachable part): one function per service function, `(deps, actor,...)`, explicit ports
and no framework. A plaintext key never leaves the server: creation encrypts it with the BYOK
envelope of `learny.platform.llm.credentials`, the DTO only carries the mask and the fingerprint,
and the qualification probes go through the injected gateway (simulated in tests, ADR-0048). Every
read and write of a learner's row runs under RLS: another learner's identifier is a 404, never a
leak (CL-1).
"""

import os
import re
from collections.abc import Callable, Mapping, Sequence
from typing import Any
from urllib.parse import urlsplit

from learny.identity.domain.actor import Actor
from learny.platform.llm.catalog import provider_region
from learny.platform.llm.credentials import (
    credential_aad,
    encrypt_secret,
    key_fingerprint,
    key_last4_of,
    key_prefix_of,
    load_keyring,
    same_fingerprint,
)
from learny.platform.llm.discovery import discover_provider_models
from learny.platform.llm.qualification import (
    COMPATIBILITY_PROMPT_ID,
    evaluate_task_compatibility,
    qualification_registry,
)
from learny.platform.llm.resolve import ResolvedModel
from learny.platform.llm.tasks import AiTask
from learny.platform.llm.types import StepInput, SystemPart
from learny.platform.safe_fetch import resolve_public_url
from learny.shared.errors import AppError
from learny.shared.ids import new_id
from learny.shared.jsonx import dumps
from learny.shared.locale_fr import ai as texts
from learny.shared.locale_fr.details import CREDENTIAL_NOT_FOUND, MODEL_NOT_IN_CREDENTIAL
from learny.shared.time import to_epoch_ms, to_iso
from learny.tutor.application.ports import TutorDeps
from learny.tutor.domain.ai_credentials import (
    create_body_issues,
    credential_dto,
    discover_body_issues,
    models_update_issues,
    record_of,
    string_list,
    trimmed,
)
from learny.tutor.domain.ai_models import build_models_state
from learny.tutor.infrastructure import byok_queries as sql
from learny.tutor.infrastructure.queries import execute, one, rows

CREDENTIAL_LIMIT = 10
MODEL_ID_MAX_LENGTH = 120
CONNECTION_PROMPT_ID = "credential.connection"
CONNECTION_SCENARIO = "qualification-success"
CONNECTION_PROBE_SYSTEM = "Connection probe: answer with one short sentence confirming the chat is reachable."
CONNECTION_PROBE_MESSAGE = "Confirm that this chat model is reachable."

# `deleteCredential` only accepts the identifier shape `crypto.randomUUID` produces.
CREDENTIAL_ID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

QualificationMerge = Callable[[dict[str, Any]], dict[str, Any]]


def local_models_allowed(env: Mapping[str, str | None] | None = None) -> bool:
    """`localModelsAllowed`: `ALLOW_LOCAL_MODELS` is the raw boolean string of the environment."""
    source = os.environ if env is None else env
    return source.get("ALLOW_LOCAL_MODELS") == "true"


def _validation_failure(issues: Sequence[Mapping[str, str]], *, status: int = 422) -> AppError:
    return AppError(
        "VALIDATION_FAILED",
        texts.INVALID_INPUT,
        status=status,
        errors=[{"path": issue["path"], "message": issue["message"]} for issue in issues],
    )


def _base_url_failure(message: str) -> AppError:
    return _validation_failure([{"path": "body.baseUrl", "message": message}])


def _model_failure(message: str, *, status: int = 422) -> AppError:
    return _validation_failure([{"path": "body.modelId", "message": message}], status=status)


def _credential_not_found() -> AppError:
    return AppError("CREDENTIAL_NOT_FOUND", CREDENTIAL_NOT_FOUND, status=404)


async def check_endpoint(provider: str, base_url: str) -> None:
    """`checkEndpoint`: a compatible endpoint is HTTPS and publicly routable (ADR-0159)."""
    if provider == "openai_compatible":
        try:
            parts = urlsplit(base_url)
        except ValueError:
            raise _base_url_failure(texts.URL_NOT_HTTPS_PUBLIC) from None
        scheme = parts.scheme.lower()
        if scheme not in ("http", "https"):
            raise _base_url_failure(texts.URL_NOT_HTTPS_PUBLIC)
        if scheme != "https":
            raise _base_url_failure(texts.URL_COMPATIBLE_HTTPS)
        await resolve_public_url(base_url)
        return
    if provider == "local":
        # ADR-0159 point 7 - the local-model exception allows a private host and any port.
        await resolve_public_url(base_url, allow_private=True)


def _iso_now(deps: TutorDeps) -> str:
    return to_iso(deps.clock.now())


def _duration_ms(started: Any, finished: Any) -> int:
    return max(0, to_epoch_ms(finished) - to_epoch_ms(started))


async def discover_credential_models(
    deps: TutorDeps,
    actor: Actor,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """`discoverCredentialModels`: the provider catalogue, without creating a credential."""
    value = dict(body)
    issues = discover_body_issues(value)
    if issues:
        raise _validation_failure(issues)
    provider = str(value["provider"])
    base_url = trimmed(value.get("baseUrl"))
    api_key = value.get("apiKey")
    if provider in ("openai_compatible", "local") and isinstance(base_url, str):
        await check_endpoint(provider, base_url)
    model_ids = await discover_provider_models(
        provider,
        api_key=api_key if isinstance(api_key, str) else None,
        base_url=base_url if isinstance(base_url, str) else None,
        mode=deps.settings.llm_mode,
    )
    if not model_ids:
        raise AppError("AI_PROVIDER_ERROR", texts.PROVIDER_NO_MODELS, status=502)
    return {"modelIds": model_ids}


async def create_credential(
    deps: TutorDeps,
    actor: Actor,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """`createCredential`: encrypts, probes the chat model, then inserts under one advisory lock."""
    value = dict(body)
    issues = create_body_issues(value)
    if issues:
        raise _validation_failure(issues)
    provider = str(value["provider"])
    base_url = trimmed(value.get("baseUrl"))
    label = trimmed(value.get("label"))
    api_key = value.get("apiKey")
    plain = api_key if isinstance(api_key, str) else None
    model_ids = [str(entry) for entry in value.get("modelIds", ())]
    if provider == "local" and not local_models_allowed():
        raise AppError("LOCAL_MODELS_DISABLED", texts.LOCAL_MODELS_DISABLED, status=422)
    if isinstance(base_url, str):
        await check_endpoint(provider, base_url)
    probe_model_id = model_ids[0] if model_ids else None
    if probe_model_id is None:
        raise _validation_failure([{"path": "body.modelIds", "message": texts.CHAT_MODEL_REQUIRED}])

    ring = load_keyring(os.environ)
    credential_id = new_id()
    aad = credential_aad(credential_id, actor.user_id)
    encrypted_key = None if plain is None else encrypt_secret(plain, aad, ring.current)
    last4 = None if plain is None else key_last4_of(plain)
    prefix = "" if plain is None else key_prefix_of(plain)
    fingerprint = None if plain is None else key_fingerprint(plain, ring.current)
    region = provider_region(provider)

    probe_started_at = deps.clock.now()
    # The new key is not stored yet: the probe calls a declared model with the plain key. A
    # discovered list can start with a model the account cannot use (an exhausted free tier, a
    # retired id): the probe tries a few models, free tiers last, and keeps the first that answers.
    # A refused key stops at once (QA, 2026-11-25).
    last_error: AppError | None = None
    connection = None
    for candidate in _probe_candidates(model_ids):
        try:
            answer = await _probe_connection(
                deps,
                scenario=CONNECTION_SCENARIO,
                model=ResolvedModel(
                    provider, candidate, "", "light", base_url if isinstance(base_url, str) else None
                ),
                api_key=plain,
            )
        except AppError as error:
            if error.code == "AI_KEY_INVALID":
                raise
            last_error = error
            continue
        if answer.text.strip() == "":
            last_error = AppError("AI_PROVIDER_ERROR", texts.CHAT_MODEL_UNCONFIRMED, status=502)
            continue
        connection, probe_model_id = answer, candidate
        break
    if connection is None:
        raise last_error or AppError("AI_PROVIDER_ERROR", texts.CHAT_MODEL_UNCONFIRMED, status=502)
    connection_report = {
        "status": "connected",
        "modelId": probe_model_id,
        "checkedAt": _iso_now(deps),
        "durationMs": _duration_ms(probe_started_at, deps.clock.now()),
    }
    qualification: dict[str, Any] = {"connection": connection_report}
    if fingerprint is not None:
        qualification = {
            "keyFingerprint": fingerprint,
            "keyPrefix": prefix,
            "connection": connection_report,
        }

    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        # Serialises creations of one learner: the cap and the duplicate check cannot race.
        await execute(tx, sql.LOCK_CREDENTIAL_CREATION, {"user_id": actor.user_id})
        existing = await rows(tx, sql.CREDENTIALS_OF_USER, {"user_id": actor.user_id})
        if len(existing) >= CREDENTIAL_LIMIT:
            raise AppError("CREDENTIAL_LIMIT_REACHED", texts.CREDENTIAL_LIMIT_REACHED, status=422)
        if plain is not None and fingerprint is not None:
            for row in existing:
                if str(row["provider"]) != provider:
                    continue
                if row.get("base_url") != base_url:
                    continue
                if row.get("key_last4") != last4:
                    continue
                stored = record_of(row.get("qualification")).get("keyFingerprint")
                if isinstance(stored, str) and same_fingerprint(stored, fingerprint):
                    raise AppError("CONFLICT", texts.CREDENTIAL_DUPLICATE, status=409)
        inserted = await one(
            tx,
            sql.INSERT_CREDENTIAL,
            {
                "id": credential_id,
                "user_id": actor.user_id,
                "provider": provider,
                "label": label if isinstance(label, str) else region.default_label,
                "base_url": base_url if isinstance(base_url, str) else None,
                "model_ids": _array_literal(model_ids),
                "encrypted_key": encrypted_key,
                "key_last4": last4,
                "status": "untested",
                "qualification": dumps(qualification).decode("utf-8"),
                "outside_eu": region.outside_eu,
                "now": now,
            },
        )
    if inserted is None:
        raise AppError("INTERNAL_ERROR", texts.CREDENTIAL_NOT_CREATED)
    return credential_dto(inserted)


async def list_credentials(deps: TutorDeps, actor: Actor) -> list[dict[str, Any]]:
    """`listCredentials`: the learner's credentials, oldest first, at most ten."""
    async with deps.db.user_tx(actor) as tx:
        found = await rows(tx, sql.LIST_CREDENTIALS, {"user_id": actor.user_id})
    return [credential_dto(row) for row in found]


async def delete_credential(deps: TutorDeps, actor: Actor, credential_id: str) -> None:
    """`deleteCredential`: the task assignments first, then the row, in one transaction."""
    if CREDENTIAL_ID_PATTERN.match(credential_id) is None:
        raise AppError("NOT_FOUND", texts.CREDENTIAL_ID_NOT_FOUND)
    async with deps.db.user_tx(actor) as tx:
        await execute(
            tx,
            sql.DELETE_CREDENTIAL_ASSIGNMENTS,
            {"user_id": actor.user_id, "credential_id": credential_id},
        )
        removed = await one(
            tx,
            sql.DELETE_CREDENTIAL,
            {"id": credential_id, "user_id": actor.user_id},
        )
    if removed is None:
        raise AppError("NOT_FOUND", texts.CREDENTIAL_ID_NOT_FOUND)


def _connection_input() -> StepInput:
    return StepInput(
        system=(SystemPart(text=CONNECTION_PROBE_SYSTEM, cache=False),),
        messages=({"role": "user", "content": CONNECTION_PROBE_MESSAGE},),
    )


PROBE_ATTEMPTS = 5


def _probe_candidates(model_ids: list[str]) -> list[str]:
    """The models a new key is probed with: declared order, free tiers last, a few at most."""
    free = [m for m in model_ids if m.endswith(("-free", ":free"))]
    paid = [m for m in model_ids if m not in free]
    return (paid + free)[:PROBE_ATTEMPTS]


async def _probe_connection(
    deps: TutorDeps,
    *,
    scenario: str,
    model: ResolvedModel | None = None,
    api_key: str | None = None,
) -> Any:
    """One connection probe: the fixtures in simulation, the probed model itself when live."""
    session = deps.llm.session(
        "light",
        CONNECTION_PROMPT_ID,
        scenario=scenario,
        fixtures=qualification_registry(),
        model=model,
        api_key=api_key,
    )
    return await session.step(_connection_input())


def _probe_model(row: Mapping[str, Any], credential_id: str, model_id: str, task: AiTask) -> ResolvedModel:
    """The stored key a probe targets; the live gateway decrypts it from `credential_id`."""
    base_url = row.get("base_url")
    return ResolvedModel(
        str(row.get("provider") or ""),
        model_id,
        credential_id,
        task,
        base_url if isinstance(base_url, str) and base_url else None,
    )


async def _load_probe_credential(
    deps: TutorDeps,
    actor: Actor,
    credential_id: str,
    model_id: str,
) -> dict[str, Any]:
    """`loadProbeCredential`: the owned key and its declared models, or a controlled refusal."""
    async with deps.db.user_tx(actor) as tx:
        row = await one(
            tx,
            sql.PROBE_CREDENTIAL,
            {"credential_id": credential_id, "user_id": actor.user_id},
        )
    if row is None:
        raise _credential_not_found()
    if model_id not in string_list(row.get("model_ids")):
        raise _model_failure(MODEL_NOT_IN_CREDENTIAL)
    return row


async def _persist_probe(
    deps: TutorDeps,
    actor: Actor,
    credential_id: str,
    merge: QualificationMerge,
) -> None:
    """`persistProbe`: merges one report under a row lock and drops the running marker."""
    async with deps.db.user_tx(actor) as tx:
        found = await one(
            tx,
            sql.LOCK_CREDENTIAL_QUALIFICATION,
            {"credential_id": credential_id, "user_id": actor.user_id},
        )
        if found is None:
            raise _credential_not_found()
        clean = merge(record_of(found.get("qualification")))
        clean.pop("run", None)
        await execute(
            tx,
            sql.UPDATE_CREDENTIAL_QUALIFICATION,
            {
                "credential_id": credential_id,
                "user_id": actor.user_id,
                "qualification": dumps(clean).decode("utf-8"),
                "now": deps.clock.now(),
            },
        )


async def _check_credential_connection(
    deps: TutorDeps,
    actor: Actor,
    credential_id: str,
    model_id: str,
    scenario: str | None,
) -> dict[str, Any]:
    """`checkCredentialConnection`: one light probe, then the `qualified` status and its date."""
    row = await _load_probe_credential(deps, actor, credential_id, model_id)
    started_at = deps.clock.now()
    connected = await _probe_connection(
        deps,
        scenario=scenario if scenario is not None else CONNECTION_SCENARIO,
        model=_probe_model(row, credential_id, model_id, "light"),
    )
    if connected.text.strip() == "":
        raise AppError("AI_PROVIDER_ERROR", texts.CHAT_MODEL_UNCONFIRMED)
    finished_at = deps.clock.now()
    report = {
        "credentialId": credential_id,
        "modelId": model_id,
        "status": "connected",
        "checkedAt": to_iso(finished_at),
        "durationMs": _duration_ms(started_at, finished_at),
    }
    await _persist_probe(
        deps,
        actor,
        credential_id,
        lambda qualification: {**qualification, "connection": report},
    )
    async with deps.db.user_tx(actor) as tx:
        await execute(
            tx,
            sql.MARK_CREDENTIAL_CONNECTED,
            {
                "credential_id": credential_id,
                "user_id": actor.user_id,
                "now": finished_at,
            },
        )
    return report


async def _check_task_compatibility(
    deps: TutorDeps,
    actor: Actor,
    credential_id: str,
    model_id: str,
    task: AiTask,
    scenario: str | None,
) -> dict[str, Any]:
    """`checkTaskCompatibility`: only the probes of the task, persisted under their tuple."""
    row = await _load_probe_credential(deps, actor, credential_id, model_id)
    session = deps.llm.session(
        task,
        COMPATIBILITY_PROMPT_ID,
        scenario=scenario if scenario is not None else f"compatibility-{task}-success",
        fixtures=qualification_registry(),
        model=_probe_model(row, credential_id, model_id, task),
    )
    report = await evaluate_task_compatibility(
        credential_id=credential_id,
        model_id=model_id,
        task=task,
        clock=deps.clock,
        session=session,
    )
    key = f"{credential_id}:{model_id}:{task}"
    await _persist_probe(
        deps,
        actor,
        credential_id,
        lambda qualification: {
            **qualification,
            "compatibilities": {
                **record_of(qualification.get("compatibilities")),
                key: report,
            },
        },
    )
    return report


async def qualify_credential(
    deps: TutorDeps,
    actor: Actor,
    credential_id: str,
    model_id: str,
    *,
    task: str | None = None,
    scenario: str | None = None,
) -> dict[str, Any]:
    """`qualifyCredential`: the connection probe, or the task compatibility when a task is given.

    The thirteen-brick battery of `legacyBattery` is a demonstration path no route reaches; the
    public operation (`me.ai.credentials.qualify`) always answers one of these two reports.
    """
    if CREDENTIAL_ID_PATTERN.match(credential_id) is None:
        raise _credential_not_found()
    if model_id.strip() == "" or len(model_id) > MODEL_ID_MAX_LENGTH:
        raise _model_failure(texts.MODEL_ID_INVALID)
    if task is None:
        return await _check_credential_connection(deps, actor, credential_id, model_id, scenario)
    if task not in ("programme", "course", "gaps", "tutor", "light"):
        raise _model_failure(texts.MODEL_ID_INVALID)
    return await _check_task_compatibility(
        deps,
        actor,
        credential_id,
        model_id,
        _as_task(task),
        scenario,
    )


async def get_models_state(deps: TutorDeps, actor: Actor) -> dict[str, Any]:
    """`getAiModelsState`: the whole tab of the authenticated learner, in one transaction."""
    async with deps.db.user_tx(actor) as tx:
        credentials = await rows(tx, sql.MODELS_CREDENTIALS, {"user_id": actor.user_id})
        assignments = await rows(tx, sql.MODELS_ASSIGNMENTS, {"user_id": actor.user_id})
    return build_models_state(credentials, assignments, deps.clock.now())


async def update_models(
    deps: TutorDeps,
    actor: Actor,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """`updateAiModels`: assigns or clears one task, then returns the state read in that write."""
    value = dict(body)
    issues = models_update_issues(value)
    if issues:
        raise _validation_failure(issues, status=400)
    now = deps.clock.now()
    action = str(value["action"])
    task = str(value["task"])
    async with deps.db.user_tx(actor) as tx:
        if action == "clear":
            await execute(
                tx,
                sql.CLEAR_TASK_MODEL,
                {"user_id": actor.user_id, "task": task},
            )
        else:
            model_id = trimmed(value.get("modelId"))
            credential_id = str(value["credentialId"])
            row = await one(
                tx,
                sql.CREDENTIAL_FOR_ASSIGNMENT,
                {"credential_id": credential_id, "user_id": actor.user_id},
            )
            if row is None:
                raise AppError("NOT_FOUND", texts.MODEL_NOT_FOUND)
            if model_id not in string_list(row.get("model_ids")):
                raise _validation_failure(
                    [{"path": "body.modelId", "message": MODEL_NOT_IN_CREDENTIAL}],
                    status=400,
                )
            await execute(
                tx,
                sql.UPSERT_TASK_MODEL,
                {
                    "user_id": actor.user_id,
                    "task": task,
                    "credential_id": credential_id,
                    "model_id": model_id,
                },
            )
        credentials = await rows(tx, sql.MODELS_CREDENTIALS, {"user_id": actor.user_id})
        assignments = await rows(tx, sql.MODELS_ASSIGNMENTS, {"user_id": actor.user_id})
    return build_models_state(credentials, assignments, now)


def _array_literal(values: Sequence[str]) -> str:
    """A `text[]` literal for a validated model list (the ids never contain a comma or a brace)."""
    return "{" + ",".join(values) + "}"


def _as_task(task: str) -> AiTask:
    return task  # type: ignore[return-value]  # narrowed by the membership test of the caller


__all__ = [
    "CONNECTION_PROMPT_ID",
    "CONNECTION_SCENARIO",
    "CREDENTIAL_LIMIT",
    "check_endpoint",
    "create_credential",
    "delete_credential",
    "discover_credential_models",
    "get_models_state",
    "list_credentials",
    "local_models_allowed",
    "qualify_credential",
    "update_models",
]
