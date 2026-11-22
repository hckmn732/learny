"""[SPEC-2203] Deterministic embeddings and vector literals (SPEC-509 EF-4, ADR-0056).

Ported from `packages/ingestion/src/embeddings.ts`. The mock vector must be bit-identical to the
TypeScript `fakeEmbedding`, because the same passages are searched from both runtimes.
"""

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest
from learny.content.domain.embeddings import (
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_DIM,
    EMBEDDING_MODEL,
    embed_texts,
    fake_embedding,
    to_vector_literal,
)
from learny.content.domain.errors import IngestionError
from learny.shared.jsmath import js_number

pytestmark = pytest.mark.spec("SPEC-2203")

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
ORACLE: dict[str, Any] = json.loads((FIXTURES / "content_domain.json").read_text(encoding="utf-8"))


def test_constants_match_the_contract() -> None:
    assert EMBEDDING_MODEL == "voyage-4-lite"
    assert EMBEDDING_DIM == 1024
    assert EMBEDDING_BATCH_SIZE == 64


@pytest.mark.parametrize("case", ORACLE["embeddings"], ids=lambda case: case["text"][:12])
def test_fake_embedding_matches_typescript(case: dict[str, Any]) -> None:
    vector = fake_embedding(case["text"])
    assert len(vector) == case["dim"] == EMBEDDING_DIM
    assert vector[:4] == case["head"]
    digest = hashlib.sha256(",".join(js_number(value) for value in vector).encode()).hexdigest()
    assert digest == case["digest"]


def test_fake_embedding_is_a_unit_vector() -> None:
    vector = fake_embedding("La photosynthese.")
    norm = sum(value * value for value in vector) ** 0.5
    assert norm == pytest.approx(1.0, abs=1e-12)


def test_vector_literal_matches_typescript() -> None:
    assert to_vector_literal([0.5, -0.25, 1, 0]) == ORACLE["vectorLiteral"]


class _Client:
    """Deterministic client that records the batches it receives."""

    def __init__(self, size: int = EMBEDDING_DIM, drop: bool = False) -> None:
        self.batches: list[list[str]] = []
        self.size = size
        self.drop = drop

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.batches.append(texts)
        vectors = [[0.0] * self.size for _ in texts]
        return vectors[:-1] if self.drop and vectors else vectors


async def test_embeddings_are_batched_in_order() -> None:
    client = _Client()
    texts = [f"passage {index}" for index in range(70)]
    vectors = await embed_texts(client, texts)
    assert [len(batch) for batch in client.batches] == [64, 6]
    assert len(vectors) == 70


async def test_empty_input_is_refused() -> None:
    with pytest.raises(IngestionError) as error:
        await embed_texts(_Client(), [])
    assert error.value.code == "TEXT_EMPTY"


async def test_one_vector_per_passage_is_required() -> None:
    with pytest.raises(IngestionError) as error:
        await embed_texts(_Client(drop=True), ["a", "b"])
    assert error.value.code == "EMBEDDING_INVALID"


async def test_wrong_dimension_is_refused() -> None:
    with pytest.raises(IngestionError) as error:
        await embed_texts(_Client(size=3), ["a"])
    assert error.value.code == "EMBEDDING_INVALID"
