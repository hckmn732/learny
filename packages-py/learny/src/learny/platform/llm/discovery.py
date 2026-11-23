"""Discovery of the provider model catalogue (SPEC-2204, port of `discover-models.ts`).

The learner's key is sent to the provider exactly as the TypeScript backend does it, with a bounded
timeout, and only chat models are kept. Simulation mode (`LLM_MODE=mock`, ADR-0048) never opens a
socket: each provider answers a fixed list. The HTTP seam (`fetcher`) exists so a test proves the
live branch without any network, exactly like `fetchImpl` in TypeScript.
"""

import re
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any

import httpx

from learny.platform.llm.catalog import AI_PROVIDERS

MODEL_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:/-]+$")
MAX_MODELS = 500
DISCOVERY_TIMEOUT_MS = 15_000
NON_CHAT_MODEL = re.compile(
    r"(?:^|[-_.:/])"
    r"(embed(?:ding)?|rerank(?:er)?|moderation|whisper|transcri(?:be|ption)|tts|speech|audio|"
    r"dall-e|image|vision-only|realtime|ada|babbage|curie|davinci|codex)"
    r"(?:$|[-_.:/])",
    re.IGNORECASE,
)

_MOCK_MODELS: dict[str, tuple[str, ...]] = {
    "anthropic": ("anthropic-model-a", "anthropic-model-b"),
    "openai": ("gpt-5.5", "gpt-5-mini"),
    "mistral": ("mistral-large-latest", "mistral-small-latest"),
    "deepseek": ("deepseek-chat", "deepseek-reasoner"),
    "openai_compatible": ("compatible-model",),
    "local": ("local-model",),
}

_ENDPOINTS: dict[str, str] = {
    "anthropic": "https://api.anthropic.com/v1/models",
    "openai": "https://api.openai.com/v1/models",
    "mistral": "https://api.mistral.ai/v1/models",
    "deepseek": "https://api.deepseek.com/models",
}

# The transport seam of the tests: `(url, headers) -> (status, decoded body)`, never a socket.
Fetcher = Callable[[str, Mapping[str, str]], Awaitable[tuple[int, Any]]]


def llm_mode(env: Mapping[str, str | None]) -> str:
    """`llmMode`: the simulated adapter unless `LLM_MODE` names a live provider.

    The Python backend no longer reads `LLM_MODE` from the process environment: the mode is derived
    from `APP_ENV` by the settings (ADR-2042) and passed to `discover_provider_models`.
    """
    value = env.get("LLM_MODE")
    if value is None or value.strip() == "":
        return "mock"
    return value.strip().lower()


def mock_models(provider: str) -> list[str]:
    """The deterministic catalogue of one provider in simulation mode (ADR-0048)."""
    return list(_MOCK_MODELS[provider])


def endpoint_of(provider: str, base_url: str | None = None) -> str:
    """The model-list endpoint of a provider, or the custom endpoint of a compatible service."""
    known = _ENDPOINTS.get(provider)
    if known is not None:
        return known
    if base_url is None:
        raise ValueError("Base URL required")
    base = base_url.rstrip("/")
    suffix = "/models" if base.endswith("/v1") else "/v1/models"
    return f"{base}{suffix}"


def headers_of(provider: str, api_key: str | None = None) -> dict[str, str]:
    """`headersOf`: the Anthropic key header, the bearer token everywhere else."""
    headers = {"Accept": "application/json"}
    if api_key is None:
        return headers
    if provider == "anthropic":
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
        return headers
    headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _record_of(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _is_chat_model(record: Mapping[str, Any], model_id: str) -> bool:
    capabilities = _record_of(record.get("capabilities"))
    for key in ("completionChat", "completion_chat", "chat", "chatCompletion"):
        if capabilities.get(key) is True:
            return True
        if capabilities.get(key) is False:
            return False
    raw_modalities = record.get("modalities")
    modalities = (
        [value for value in raw_modalities if isinstance(value, str)]
        if isinstance(raw_modalities, (list, tuple))
        else []
    )
    if modalities and not any(re.match(r"^(text|image)$", value, re.IGNORECASE) for value in modalities):
        return False
    endpoint = str(record.get("endpoint") or "").lower()
    if endpoint != "" and re.search(r"(chat|completion)", endpoint) is None:
        return False
    object_name = str(record.get("object") or "").lower()
    if "embedding" in object_name or "moderation" in object_name:
        return False
    return NON_CHAT_MODEL.search(model_id) is None


def chat_model_ids_of(payload: Any) -> list[str]:
    """`chatModelIdsOf`: the unique chat model identifiers of a provider answer, sorted."""
    if not isinstance(payload, Mapping):
        return []
    raw_entries = payload.get("data")
    if not isinstance(raw_entries, (list, tuple)):
        raw_entries = payload.get("models")
    entries: Sequence[Any] = raw_entries if isinstance(raw_entries, (list, tuple)) else []
    identifiers: list[str] = []
    for entry in entries:
        if isinstance(entry, str):
            identifiers.append(entry)
            continue
        if not isinstance(entry, Mapping):
            continue
        value = entry.get("id")
        if value is None:
            value = entry.get("model")
        if value is None:
            value = entry.get("name")
        if not isinstance(value, str) or not _is_chat_model(entry, value.strip()):
            continue
        identifiers.append(value)
    unique = list(dict.fromkeys(identifiers))
    kept = [
        model_id.strip()
        for model_id in unique
        if model_id.strip() != ""
        and len(model_id) <= 200
        and MODEL_ID_PATTERN.match(model_id.strip()) is not None
    ]
    return sorted(kept)[:MAX_MODELS]


async def _fetch_with_httpx(url: str, headers: Mapping[str, str], timeout_ms: int) -> tuple[int, Any]:
    async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
        response = await client.get(url, headers=dict(headers))
        return response.status_code, response.json()


async def discover_provider_models(
    provider: str,
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    mode: str | None = None,
    fetcher: Fetcher | None = None,
    timeout_ms: int = DISCOVERY_TIMEOUT_MS,
) -> list[str]:
    """`discoverProviderModels`: the chat catalogue of one provider, simulated or live."""
    if (mode if mode is not None else "mock") == "mock":
        return mock_models(provider)
    if provider not in AI_PROVIDERS:
        raise ValueError(f"unknown AI provider: {provider}")
    endpoint = endpoint_of(provider, base_url)
    transport = fetcher if fetcher is not None else _default_fetch
    status, payload = await transport(endpoint, headers_of(provider, api_key))
    if status < 200 or status >= 300:
        raise RuntimeError(f"Provider model discovery failed ({status})")
    return chat_model_ids_of(payload)


async def _default_fetch(url: str, headers: Mapping[str, str]) -> tuple[int, Any]:
    return await _fetch_with_httpx(url, headers, DISCOVERY_TIMEOUT_MS)


__all__ = [
    "DISCOVERY_TIMEOUT_MS",
    "MAX_MODELS",
    "MODEL_ID_PATTERN",
    "NON_CHAT_MODEL",
    "Fetcher",
    "chat_model_ids_of",
    "discover_provider_models",
    "endpoint_of",
    "headers_of",
    "llm_mode",
    "mock_models",
]
