"""Voyage AI embeddings of the passages (SPEC-509 EF-4, ET-2; ADR-0056).

Live mode calls Voyage AI `voyage-4-lite` with the server-side key; mock mode derives a
deterministic unit vector from SHA-256 blocks of the text, so no test or demonstration ever reaches
the network. A missing key is a permanent configuration failure, 429 and 5xx are transient, and the
provider body is never surfaced: it can quote the input.
"""

import json
from typing import Any, Protocol

import httpx

from learny.content.domain.embeddings import (
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_DIM,
    EMBEDDING_MODEL,
    fake_embedding,
    to_vector_literal,
)
from learny.content.domain.errors import IngestionError
from learny.shared.config import Settings
from learny.shared.locale_fr import content as texts

VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings"
VOYAGE_TIMEOUT_SECONDS = 60.0


class EmbeddingProvider(Protocol):
    """One embedding adapter; `learny.content.domain.embeddings.EmbeddingClient` matches it."""

    async def embed(self, texts_to_embed: list[str]) -> list[list[float]]: ...


class MockEmbedder:
    """ADR-0056: deterministic unit vectors, identical to the reference mock."""

    async def embed(self, texts_to_embed: list[str]) -> list[list[float]]:
        return [fake_embedding(text) for text in texts_to_embed]


class VoyageEmbedder:
    """EF-4: Voyage AI client; the key travels in the `Authorization` header only."""

    def __init__(
        self,
        api_key: str | None,
        *,
        endpoint: str = VOYAGE_ENDPOINT,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self._endpoint = endpoint
        self._transport = transport

    async def embed(self, texts_to_embed: list[str]) -> list[list[float]]:
        if self._api_key is None or self._api_key.strip() == "":
            raise IngestionError("EMBEDDING_KEY_INVALID", texts.EMBEDDING_KEY_INVALID)
        payload = {
            "input": texts_to_embed,
            "model": EMBEDDING_MODEL,
            "input_type": "document",
            "output_dimension": EMBEDDING_DIM,
        }
        try:
            async with httpx.AsyncClient(
                timeout=VOYAGE_TIMEOUT_SECONDS, transport=self._transport, trust_env=False
            ) as client:
                response = await client.post(
                    self._endpoint,
                    headers={
                        "authorization": f"Bearer {self._api_key}",
                        "content-type": "application/json",
                    },
                    content=json.dumps(payload, ensure_ascii=False),
                )
        except httpx.HTTPError as error:
            raise IngestionError(
                "EMBEDDING_UNAVAILABLE", texts.EMBEDDING_UNAVAILABLE, permanent=False
            ) from error
        if response.status_code in (401, 403):
            raise IngestionError(
                "EMBEDDING_KEY_INVALID",
                texts.EMBEDDING_KEY_REFUSED,
                status=response.status_code,
            )
        if response.status_code == 429 or response.status_code >= 500:
            raise IngestionError(
                "EMBEDDING_UNAVAILABLE",
                texts.EMBEDDING_UNAVAILABLE,
                permanent=False,
                status=response.status_code,
            )
        if response.status_code >= 400:
            raise IngestionError(
                "EMBEDDING_INVALID",
                texts.EMBEDDING_REQUEST_REFUSED,
                status=response.status_code,
            )
        try:
            payload_json: Any = response.json()
        except ValueError as error:
            raise IngestionError("EMBEDDING_INVALID", texts.EMBEDDING_UNREADABLE) from error
        vectors = _vectors_of(payload_json)
        if vectors is None:
            raise IngestionError("EMBEDDING_INVALID", texts.EMBEDDING_RESPONSE_INVALID)
        return vectors


def _vectors_of(payload: Any) -> list[list[float]] | None:
    """The `data[].embedding` shape of a Voyage answer, or `None` when it is invalid."""
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if not isinstance(data, list):
        return None
    vectors: list[list[float]] = []
    for entry in data:
        if not isinstance(entry, dict):
            return None
        embedding = entry.get("embedding")
        if not isinstance(embedding, list):
            return None
        vector: list[float] = []
        for component in embedding:
            if isinstance(component, bool) or not isinstance(component, (int, float)):
                return None
            vector.append(float(component))
        vectors.append(vector)
    return vectors


def mode_of(settings: Settings) -> str:
    """`LLM_MODE` with the documented fallback: a missing value means `mock`."""
    return "live" if settings.llm_mode == "live" else "mock"


def default_embedder(settings: Settings) -> EmbeddingProvider:
    """Resolves the embedding provider from the settings; mock is the default outside live."""
    if mode_of(settings) == "mock":
        return MockEmbedder()
    return VoyageEmbedder(settings.voyage_api_key)


__all__ = [
    "EMBEDDING_BATCH_SIZE",
    "EMBEDDING_DIM",
    "EMBEDDING_MODEL",
    "VOYAGE_ENDPOINT",
    "EmbeddingProvider",
    "MockEmbedder",
    "VoyageEmbedder",
    "default_embedder",
    "mode_of",
    "to_vector_literal",
]
