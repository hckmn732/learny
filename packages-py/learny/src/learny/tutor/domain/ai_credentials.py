"""Personal AI keys: public shape and body refinements (SPEC-2204).

A credential row becomes the only shape a browser receives: the mask, the region flag and the note,
never the key nor the ciphertext (EF-4). The issue lists are shared by the HTTP pipeline and by the
use cases, so a direct call refuses the same bodies as a route call (ADR-2012).
"""

import json
from collections.abc import Mapping
from datetime import datetime
from typing import Any

from learny.platform.llm.catalog import provider_region
from learny.platform.llm.credentials import mask_key
from learny.shared.locale_fr import ai as texts
from learny.shared.locale_fr import validation
from learny.shared.time import to_iso

ARRAY_BRACES = ("{", "}")


def record_of(value: Any) -> dict[str, Any]:
    """`recordOf`: a mapping, a JSON object string, or an empty mapping."""
    if value is None:
        return {}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return dict(value) if isinstance(value, Mapping) else {}


def string_list(value: Any) -> list[str]:
    """`stringList`: a `text[]` column as read by the driver, or a PostgreSQL array literal."""
    if isinstance(value, (list, tuple)):
        return [entry if isinstance(entry, str) else str(entry) for entry in value]
    if isinstance(value, str) and value.startswith("{") and value.endswith("}"):
        return [
            entry.replace('"', "").strip()
            for entry in value[1:-1].split(",")
            if entry.replace('"', "").strip() != ""
        ]
    return []


def iso_of(value: Any) -> str:
    """`isoOf`: a `Date` or a timestamp string, both rendered as an ISO instant."""
    if isinstance(value, datetime):
        return to_iso(value)
    return to_iso(datetime.fromisoformat(str(value).replace("Z", "+00:00")))


def credential_dto(row: Mapping[str, Any]) -> dict[str, Any]:
    """`toDto`: one row to the only public shape, with the catalogue's region and note (CA-5)."""
    provider = str(row["provider"])
    region = provider_region(provider)
    qualification = record_of(row.get("qualification"))
    prefix = qualification.get("keyPrefix")
    key_last4 = row.get("key_last4")
    connection = record_of(qualification.get("connection")).get("status")
    qualified_at = row.get("qualified_at")
    return {
        "id": str(row["id"]),
        "provider": provider,
        "providerLabel": region.provider_label,
        "label": row["label"],
        "baseUrl": row.get("base_url"),
        "modelIds": string_list(row.get("model_ids")),
        "keyMasked": (
            None if key_last4 is None else mask_key(str(key_last4), prefix if isinstance(prefix, str) else "")
        ),
        "status": str(row["status"]),
        "connectionStatus": connection if isinstance(connection, str) else "unknown",
        "outsideEu": region.outside_eu,
        "dataNote": region.data_note,
        "qualifiedAt": None if qualified_at is None else iso_of(qualified_at),
        "createdAt": iso_of(row["created_at"]),
    }


def _issue(path: str, message: str) -> dict[str, str]:
    return {"path": path, "message": message}


def _null_string_issue(value: Mapping[str, Any], field: str) -> list[dict[str, str]]:
    """`z.string().optional()` rejects an explicit `null`; the generated model accepts it."""
    if field in value and value[field] is None:
        return [_issue(f"body.{field}", validation.invalid_type("string", "null"))]
    return []


def _blank_string_issue(value: Mapping[str, Any], field: str) -> list[dict[str, str]]:
    """`z.string().trim().min(1)`: a value made of blanks fails after the trim."""
    candidate = value.get(field)
    if isinstance(candidate, str) and candidate.strip() == "":
        return [_issue(f"body.{field}", validation.too_small("string", 1, inclusive=True))]
    return []


def create_body_issues(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    """`AiCredentialCreateBody.superRefine`: the refinements OpenAPI cannot express."""
    base = [
        *_null_string_issue(value, "label"),
        *_blank_string_issue(value, "label"),
        *_null_string_issue(value, "baseUrl"),
        *_blank_string_issue(value, "baseUrl"),
    ]
    if base:
        # A failed base parse skips the refinement block in Zod, exactly like here.
        return base
    issues: list[dict[str, str]] = []
    model_ids = value.get("modelIds")
    if isinstance(model_ids, (list, tuple)) and len(set(model_ids)) != len(model_ids):
        issues.append(_issue("body.modelIds", texts.MODEL_IDS_UNIQUE))
    provider = value.get("provider")
    needs_key = provider != "local"
    if needs_key and value.get("apiKey") is None:
        issues.append(_issue("body.apiKey", texts.API_KEY_REQUIRED))
    needs_url = provider in ("openai_compatible", "local")
    if needs_url and value.get("baseUrl") is None:
        issues.append(_issue("body.baseUrl", texts.BASE_URL_REQUIRED))
    if not needs_url and value.get("baseUrl") is not None:
        issues.append(_issue("body.baseUrl", texts.BASE_URL_NOT_ALLOWED))
    return issues or None


def discover_body_issues(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    """`AiCredentialDiscoverBody.superRefine`: key and endpoint required by provider."""
    base = [*_null_string_issue(value, "baseUrl"), *_blank_string_issue(value, "baseUrl")]
    if base:
        return base
    issues: list[dict[str, str]] = []
    provider = value.get("provider")
    if provider != "local" and value.get("apiKey") is None:
        issues.append(_issue("body.apiKey", texts.API_KEY_REQUIRED))
    if provider in ("openai_compatible", "local") and value.get("baseUrl") is None:
        issues.append(_issue("body.baseUrl", texts.BASE_URL_REQUIRED))
    return issues or None


def models_update_issues(value: Mapping[str, Any]) -> list[dict[str, str]] | None:
    """`AiModelsUpdateBody`: `z.string().trim().min(1)` on the assigned model identifier."""
    if value.get("action") != "assign":
        return None
    model_id = value.get("modelId")
    if isinstance(model_id, str) and model_id.strip() == "":
        return [_issue("body.modelId", validation.too_small("string", 1, inclusive=True))]
    return None


def trimmed(value: Any) -> Any:
    """`z.string().trim()`: the stored value is the trimmed one."""
    return value.strip() if isinstance(value, str) else value


__all__ = [
    "create_body_issues",
    "credential_dto",
    "discover_body_issues",
    "iso_of",
    "models_update_issues",
    "record_of",
    "string_list",
    "trimmed",
]
