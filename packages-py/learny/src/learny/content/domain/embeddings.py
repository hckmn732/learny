"""Embeddings of the passages (SPEC-509 EF-4, ET-2; ADR-0056).

Port of `packages/ingestion/src/embeddings.ts`. Mock mode derives a deterministic unit vector from
SHA-256 blocks of the text, exactly like `fakeEmbedding` of `@learny/db/testing`, so no test or
demonstration ever reaches the network. Every vector is checked to have exactly `EMBEDDING_DIM`
finite components before anything is written.
"""

import hashlib
import math
from typing import Protocol

from learny.content.domain.errors import IngestionError
from learny.shared.jsmath import js_number
from learny.shared.locale_fr import content as texts

EMBEDDING_MODEL = "voyage-4-lite"
EMBEDDING_BATCH_SIZE = 64
EMBEDDING_DIM = 1024
_MAX_UINT32 = 0xFFFF_FFFF


class EmbeddingClient(Protocol):
    """Port of the embedding provider used by the ingestion."""

    async def embed(self, texts: list[str]) -> list[list[float]]: ...


def fake_embedding(text: str) -> list[float]:
    """ADR-0056: deterministic 1024-dimension unit vector used when `LLM_MODE=mock`."""
    components: list[float] = []
    block = 0
    while len(components) < EMBEDDING_DIM:
        digest = hashlib.sha256(f"{block}:{text}".encode()).digest()
        offset = 0
        while offset + 4 <= len(digest) and len(components) < EMBEDDING_DIM:
            value = int.from_bytes(digest[offset : offset + 4], "big")
            components.append((value / _MAX_UINT32) * 2 - 1)
            offset += 4
        block += 1
    # A left-to-right double accumulation: `sum()` compensates since Python 3.12 and would
    # produce a different norm than `Array.prototype.reduce` on the same components.
    squared = 0.0
    for component in components:
        squared = squared + component * component
    norm = math.sqrt(squared)
    if norm == 0:
        fallback = [0.0] * EMBEDDING_DIM
        fallback[0] = 1.0
        return fallback
    return [value / norm for value in components]


def to_vector_literal(embedding: list[float]) -> str:
    """pgvector text input (`'[0.1,0.2,...]'`)."""
    return "[" + ",".join(js_number(value) for value in embedding) + "]"


def invalid_vector(index: int) -> IngestionError:
    """A vector that does not have `EMBEDDING_DIM` finite components is refused before any write."""
    return IngestionError(
        "EMBEDDING_INVALID",
        texts.EMBEDDING_VECTOR_INVALID.format(index=index + 1, dim=EMBEDDING_DIM),
    )


async def embed_texts(
    client: EmbeddingClient,
    texts_to_embed: list[str],
    batch_size: int = EMBEDDING_BATCH_SIZE,
) -> list[list[float]]:
    """EF-4: embeds passages in order, `batch_size` at a time, and validates every vector."""
    if not texts_to_embed:
        raise IngestionError("TEXT_EMPTY", texts.EMBEDDING_NOTHING_TO_EMBED)
    vectors: list[list[float]] = []
    offset = 0
    while offset < len(texts_to_embed):
        batch = texts_to_embed[offset : offset + batch_size]
        embedded = await client.embed(batch)
        if len(embedded) != len(batch):
            raise IngestionError("EMBEDDING_INVALID", texts.EMBEDDING_NOT_ONE_PER_CHUNK)
        for vector in embedded:
            if len(vector) != EMBEDDING_DIM or any(not math.isfinite(component) for component in vector):
                raise invalid_vector(len(vectors))
            vectors.append(vector)
        offset += batch_size
    return vectors
