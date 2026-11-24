"""Pure projections of the " Modeles d'IA " tab (SPEC-2204)."""

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from learny.platform.llm.catalog import provider_region
from learny.platform.llm.credentials import mask_key
from learny.platform.llm.qualification import parse_report
from learny.platform.llm.tasks import AI_TASKS, TASK_CAPABILITIES, TASK_CONFIG, TaskCapability
from learny.shared.locale_fr import ai as texts
from learny.tutor.domain.ai_credentials import iso_of, record_of, string_list

AI_MODEL_OPTIONS_MAX = 500
MODEL_ID_MAX_LENGTH = 200
COMPATIBILITY_RESERVE_CODES = ("STRUCTURED_UNRELIABLE", "NO_VISION", "NO_TOOLS", "CHECK_TIMEOUT")
TASK_CAPABILITY_IDS = ("tools", "structured", "web_search", "passage_refs", "vision")

CredentialRow = Mapping[str, Any]
AssignmentRow = Mapping[str, Any]


def task_capabilities(task: str) -> list[TaskCapability]:
    """`taskCapabilities`: the routing capabilities of one task, from the single task table."""
    return list(TASK_CONFIG[_as_task(task)].capabilities)


def qualification_report_of(
    qualification: Mapping[str, Any],
    model_id: str,
) -> Any:
    """`qualificationReportOf`: the per-model report stored with the credential, or `None`."""
    models = record_of(qualification.get("models"))
    return parse_report(models.get(model_id))


def model_qualified_for_task(
    row: CredentialRow,
    model_id: str,
    capabilities: Sequence[TaskCapability],
) -> bool:
    """`modelQualifiedForTask`: the key owns the model and the task's capabilities are known."""
    if model_id not in string_list(row.get("model_ids")):
        return False
    return all(capability in TASK_CAPABILITIES for capability in capabilities)


def legacy_qualification_status(
    row: CredentialRow,
    model_id: str,
    capabilities: Sequence[TaskCapability],
) -> str:
    """`legacyQualificationStatus`: the pill of one personal option."""
    if str(row.get("status")) != "qualified":
        return "unqualified"
    report = qualification_report_of(record_of(row.get("qualification")), model_id)
    if report is None:
        return "qualified"
    proven = report.capabilities
    return (
        "qualified"
        if report.status == "qualified" and all(getattr(proven, capability) for capability in capabilities)
        else "unqualified"
    )


def personal_options_for(row: CredentialRow, capabilities: Sequence[TaskCapability]) -> list[dict[str, Any]]:
    """`personalOptionsFor`: the selectable models of one key, in declaration order."""
    models = string_list(row.get("model_ids"))
    region = provider_region(str(row["provider"]))
    options: list[dict[str, Any]] = []
    for model_id in models:
        options.append(
            {
                "modelId": model_id,
                "label": texts.personal_label(
                    region.provider_label,
                    None if len(models) == 1 else model_id,
                ),
                "credentialId": str(row["id"]),
                "provider": str(row["provider"]),
                "providerLabel": region.provider_label,
                "outsideEu": region.outside_eu,
                "qualificationStatus": legacy_qualification_status(row, model_id, capabilities),
            }
        )
    return options


def model_options_for_task(
    task: str,
    credentials: Sequence[CredentialRow],
) -> list[dict[str, Any]]:
    """`modelOptionsForTask`: every model the task can select, keys oldest first."""
    capabilities = task_capabilities(task)
    options: list[dict[str, Any]] = []
    for row in credentials:
        options.extend(personal_options_for(row, capabilities))
    return options


def unavailable_reason(
    row: CredentialRow | None,
    model_id: str,
    capabilities: Sequence[TaskCapability],
) -> str | None:
    """`unavailableReason`: why a chosen model cannot run, or `None` when it can."""
    if row is None:
        return "credential_not_qualified"
    if model_id not in string_list(row.get("model_ids")):
        return "personal_model_missing"
    return None if model_qualified_for_task(row, model_id, capabilities) else "credential_not_qualified"


def pending_compatibility(credential_id: str, model_id: str, task: str) -> dict[str, Any]:
    """`pendingCompatibility`: the exact key/model/task tuple has not been checked yet."""
    return {
        "credentialId": credential_id,
        "modelId": model_id,
        "task": task,
        "status": "pending",
        "checkedAt": None,
        "durationMs": 0,
        "requiredCapabilities": task_capabilities(task),
        "reserveCodes": [],
        "reasons": [],
    }


def compatibility_storage_key(credential_id: str, model_id: str, task: str) -> str:
    """`compatibilityStorageKey`: how a per-task report is nested in the qualification column."""
    return f"{credential_id}:{model_id}:{task}"


def task_compatibility_state_of(
    qualification: Mapping[str, Any],
    credential_id: str,
    model_id: str,
    task: str,
) -> dict[str, Any]:
    """`taskCompatibilityStateOf`: the stored report of the tuple, else a `pending` placeholder."""
    key = compatibility_storage_key(credential_id, model_id, task)
    stored = record_of(record_of(qualification.get("compatibilities")).get(key))
    parsed = _parse_compatibility(stored)
    return parsed if parsed is not None else pending_compatibility(credential_id, model_id, task)


def _parse_compatibility(value: Mapping[str, Any]) -> dict[str, Any] | None:
    from learny.platform.llm.qualification import parse_compatibility

    return parse_compatibility(value)


def task_state_of(
    task: str,
    assignment: AssignmentRow | None,
    credentials: Sequence[CredentialRow],
) -> dict[str, Any]:
    """`taskStateOf`: one row of " Modele par tache ", with its pills derived from the choice."""
    capabilities = task_capabilities(task)
    options = model_options_for_task(task, credentials)
    if assignment is None:
        return {
            "task": task,
            "requiredCapabilities": capabilities,
            "modelId": None,
            "credentialId": None,
            "provider": None,
            "providerLabel": None,
            "outsideEu": False,
            "available": False,
            "unavailableReason": "no_model_selected",
            "options": options,
        }
    model_id = str(assignment["model_id"])
    credential_id = assignment.get("credential_id")
    if credential_id is None:
        return {
            "task": task,
            "requiredCapabilities": capabilities,
            "modelId": model_id,
            "credentialId": None,
            "provider": None,
            "providerLabel": texts.PERSONAL_MODEL_LABEL,
            "outsideEu": False,
            "available": False,
            "unavailableReason": "credential_not_qualified",
            "options": options,
        }
    owned = str(credential_id)
    row = next((candidate for candidate in credentials if str(candidate["id"]) == owned), None)
    reason = unavailable_reason(row, model_id, capabilities)
    region = None if row is None else provider_region(str(row["provider"]))
    return {
        "task": task,
        "requiredCapabilities": capabilities,
        "modelId": model_id,
        "credentialId": owned,
        "provider": None if row is None else str(row["provider"]),
        "providerLabel": texts.PERSONAL_MODEL_LABEL if region is None else region.provider_label,
        "outsideEu": False if region is None else region.outside_eu,
        "available": reason is None,
        "unavailableReason": reason,
        "compatibility": (
            None
            if row is None or reason is not None
            else task_compatibility_state_of(record_of(row.get("qualification")), owned, model_id, task)
        ),
        "options": options,
    }


def provider_failure_of(qualification: Mapping[str, Any]) -> dict[str, Any] | None:
    """`providerFailureOf`: the faulty stage of the last battery, without prompt or key."""
    models = [record_of(value) for value in record_of(qualification.get("models")).values()]
    last_run_id = qualification.get("lastRunId")
    ordered = models
    if isinstance(last_run_id, str):
        ordered = [
            *[entry for entry in models if entry.get("id") == last_run_id],
            *[entry for entry in models if entry.get("id") != last_run_id],
        ]
    for candidate in ordered:
        report = parse_report(candidate)
        if report is None or report.status != "failed":
            continue
        step = next(
            (entry.step for entry in report.steps if entry.status == "failed"),
            "bricks",
        )
        brick = next((entry for entry in report.bricks if entry.status == "failed"), None)
        return {
            "step": step,
            "brickType": (None if brick is None else brick.type) if step == "bricks" else None,
        }
    return None


def provider_card_of(row: CredentialRow) -> dict[str, Any]:
    """`providerCardOf`: one provider card; the key is only ever a mask (BR-SET-05)."""
    region = provider_region(str(row["provider"]))
    qualification = record_of(row.get("qualification"))
    prefix = qualification.get("keyPrefix")
    key_last4 = row.get("key_last4")
    running = record_of(qualification.get("run")).get("status") == "running"
    status = str(row.get("status"))
    connected = record_of(qualification.get("connection")).get("status") == "connected"
    qualified_at = row.get("qualified_at")
    return {
        "id": str(row["id"]),
        "provider": str(row["provider"]),
        "providerLabel": region.provider_label,
        "label": row["label"],
        "keyMasked": (
            None if key_last4 is None else mask_key(str(key_last4), prefix if isinstance(prefix, str) else "")
        ),
        "status": "qualified" if status == "qualified" else ("pending" if running else "unqualified"),
        "connectionStatus": "connected" if connected or status == "qualified" else "unknown",
        "outsideEu": region.outside_eu,
        "dataNote": region.data_note,
        "models": string_list(row.get("model_ids")),
        "qualifiedAt": None if qualified_at is None else iso_of(qualified_at),
        "failure": provider_failure_of(qualification),
    }


def build_models_state(
    credentials: Sequence[CredentialRow],
    assignments: Sequence[AssignmentRow],
    now: datetime,
) -> dict[str, Any]:
    """`readAiModelsState`: the whole tab, in the mockup order and oldest credentials first."""
    return {
        "tasks": [
            task_state_of(
                task,
                next(
                    (entry for entry in assignments if str(entry.get("task")) == task),
                    None,
                ),
                credentials,
            )
            for task in AI_TASKS
        ],
        "providers": [provider_card_of(row) for row in credentials],
        "updatedAt": iso_of(now),
    }


def _as_task(task: str) -> Any:
    if task not in TASK_CONFIG:
        raise KeyError(f"unknown AI task: {task}")
    return task


__all__ = [
    "AI_MODEL_OPTIONS_MAX",
    "COMPATIBILITY_RESERVE_CODES",
    "MODEL_ID_MAX_LENGTH",
    "TASK_CAPABILITY_IDS",
    "build_models_state",
    "compatibility_storage_key",
    "legacy_qualification_status",
    "model_options_for_task",
    "model_qualified_for_task",
    "pending_compatibility",
    "personal_options_for",
    "provider_card_of",
    "provider_failure_of",
    "qualification_report_of",
    "task_capabilities",
    "task_compatibility_state_of",
    "task_state_of",
    "unavailable_reason",
]
