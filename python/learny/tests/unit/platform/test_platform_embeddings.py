"""[SPEC-2203] Embedding adapters: deterministic mock, Voyage errors and bounds."""

import json

import httpx
import pytest
from learny.content.domain.embeddings import EMBEDDING_DIM, fake_embedding
from learny.platform.embeddings import (
    MockEmbedder,
    VoyageEmbedder,
    default_embedder,
    token_batches,
)
from learny.shared.config import Settings
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-2203")


def embedder_with(handler: object) -> VoyageEmbedder:
    return VoyageEmbedder(
        "voyage-secret",
        transport=httpx.MockTransport(handler),  # type: ignore[arg-type]
        rate_limit_waits=(),
    )


async def test_the_mock_vector_is_deterministic_and_normalised() -> None:
    client = MockEmbedder()

    first = await client.embed(["Le compte 512 enregistre la banque."])
    second = await client.embed(["Le compte 512 enregistre la banque."])

    assert len(first) == 1
    assert len(first[0]) == EMBEDDING_DIM
    assert first == second
    assert first[0] == fake_embedding("Le compte 512 enregistre la banque.")
    norm = sum(component * component for component in first[0]) ** 0.5
    assert norm == pytest.approx(1.0)


async def test_a_missing_key_is_a_permanent_configuration_failure() -> None:
    with pytest.raises(AppError) as error:
        await VoyageEmbedder(None).embed(["texte"])

    assert error.value.code == "EMBEDDING_KEY_INVALID"
    assert getattr(error.value, "permanent", True) is True


async def test_the_voyage_request_carries_the_documented_parameters() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["authorization"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"data": [{"embedding": [0.0] * EMBEDDING_DIM}]})

    vectors = await embedder_with(handler).embed(["premier passage"])

    assert len(vectors) == 1
    assert len(vectors[0]) == EMBEDDING_DIM
    assert seen["authorization"] == "Bearer voyage-secret"
    assert seen["body"] == {
        "input": ["premier passage"],
        "model": "voyage-4-lite",
        "input_type": "document",
        "output_dimension": EMBEDDING_DIM,
    }


@pytest.mark.parametrize(
    ("status", "code", "permanent"),
    [
        (401, "EMBEDDING_KEY_INVALID", True),
        (403, "EMBEDDING_KEY_INVALID", True),
        (429, "EMBEDDING_UNAVAILABLE", False),
        (503, "EMBEDDING_UNAVAILABLE", False),
        (400, "EMBEDDING_INVALID", True),
    ],
)
async def test_provider_statuses_map_to_the_ingestion_codes(status: int, code: str, permanent: bool) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={})

    with pytest.raises(AppError) as error:
        await embedder_with(handler).embed(["texte"])

    assert error.value.code == code
    assert getattr(error.value, "permanent", True) is permanent


async def test_a_network_failure_is_transient() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    with pytest.raises(AppError) as error:
        await embedder_with(handler).embed(["texte"])

    assert error.value.code == "EMBEDDING_UNAVAILABLE"
    assert getattr(error.value, "permanent", True) is False


@pytest.mark.parametrize(
    "payload",
    [
        b"not json",
        json.dumps({"data": "not a list"}).encode(),
        json.dumps({"data": [{"embedding": "not a list"}]}).encode(),
        json.dumps({"data": [{"embedding": ["x"]}]}).encode(),
    ],
)
async def test_an_invalid_answer_is_refused(payload: bytes) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=payload)

    with pytest.raises(AppError) as error:
        await embedder_with(handler).embed(["texte"])

    assert error.value.code == "EMBEDDING_INVALID"


def test_the_default_adapter_follows_llm_mode() -> None:
    assert isinstance(default_embedder(Settings(llm_mode="mock")), MockEmbedder)
    assert isinstance(default_embedder(Settings(llm_mode="live", voyage_api_key="k")), VoyageEmbedder)


async def test_rate_limit_waits_then_retries_the_same_batch() -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        if len(calls) == 1:
            return httpx.Response(429, headers={"retry-after": "0"})
        size = len(json.loads(request.content)["input"])
        return httpx.Response(200, json={"data": [{"embedding": [0.0] * 3} for _ in range(size)]})

    embedder = VoyageEmbedder(
        "voyage-secret",
        transport=httpx.MockTransport(handler),
        rate_limit_waits=(0.0,),
    )
    assert len(await embedder.embed(["a", "b"])) == 2
    assert len(calls) == 2


def test_token_batches_stay_under_the_limit() -> None:
    texts = ["x" * 4000] * 10  # ~1000 tokens each
    batches = token_batches(texts, limit=2500)
    assert [len(batch) for batch in batches] == [2, 2, 2, 2, 2]
    assert token_batches(["x" * 40000], limit=2500) == [["x" * 40000]]
