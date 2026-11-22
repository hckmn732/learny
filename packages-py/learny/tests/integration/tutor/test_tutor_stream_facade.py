"""[SPEC-2204] The SSE route through the facade: headers, first chunk latency, oracle order.

The app is the real `create_app` (routing, pipeline guards, handler, `StreamingResponse`); only the
bearer resolution and the legal-version guard are stubbed, because the suite seeds no GoTrue
session. The body is driven straight through the ASGI interface, so every frame timestamp is the
instant the writer produced it: that is the first-chunk latency the client observes.
"""

import asyncio
import json
import time
from pathlib import Path
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import actor_for
from factories.tutor_support import RecordingGateway, seed_tutor, tutor_deps
from learny.identity.domain.actor import Actor
from learny.shared.config import Settings
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import load_catalog
from learny.tutor.application.stream import STREAMING
from learny_api import pipeline
from learny_api.guards.idempotency import IdempotencyStore
from learny_api.guards.origin import create_request_origin_guard
from learny_api.guards.rate_limit import create_rate_limiter
from learny_api.main import create_app
from learny_api.sse import STREAM_CONTENT_TYPE
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2204")

ROOT = Path(__file__).resolve().parents[5]
ORACLE = json.loads((ROOT / "api" / "oracles" / "vectors" / "tutor.json").read_text("utf-8"))
FIRST_CHUNK_MAX_MS = 500.0
CONVERSATION_ID = "44444444-4444-4444-8444-444444444444"


class FacadeResult:
    """Status, headers and body chunks of one ASGI call, with the instant of the first chunk."""

    def __init__(
        self,
        status: int,
        headers: dict[str, str],
        chunks: list[bytes],
        first_chunk_ms: float | None,
    ) -> None:
        self.status = status
        self.headers = headers
        self.chunks = chunks
        self.first_chunk_ms = first_chunk_ms

    @property
    def body(self) -> bytes:
        return b"".join(self.chunks)

    def payloads(self) -> list[dict[str, Any]]:
        found = []
        for line in self.body.decode("utf-8").split("\n\n"):
            if not line.startswith("data: "):
                continue
            if line == "data: [DONE]":
                continue
            found.append(json.loads(line[len("data: ") :]))
        return found


async def call(app: Any, path: str, payload: dict[str, Any]) -> FacadeResult:
    """One POST through the ASGI app, timestamps kept for the first chunk."""
    body = json.dumps(payload).encode("utf-8")
    messages: list[tuple[float, dict[str, Any]]] = []
    started = time.perf_counter()
    consumed = False
    finished = asyncio.Event()

    async def receive() -> dict[str, Any]:
        nonlocal consumed
        if not consumed:
            consumed = True
            return {"type": "http.request", "body": body, "more_body": False}
        await finished.wait()
        return {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        messages.append((time.perf_counter(), message))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "root_path": "",
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
            (b"authorization", b"Bearer suite-token"),
            (b"sec-fetch-site", b"same-origin"),
        ],
        "client": ("127.0.0.1", 41234),
        "server": ("testserver", 80),
    }
    try:
        await app(scope, receive, send)
    finally:
        finished.set()
    start = next(message for _, message in messages if message["type"] == "http.response.start")
    chunks = [
        (at, message["body"])
        for at, message in messages
        if message["type"] == "http.response.body" and message["body"] != b""
    ]
    headers = {key.decode("utf-8").lower(): value.decode("utf-8") for key, value in start["headers"]}
    first = None if not chunks else (chunks[0][0] - started) * 1000.0
    return FacadeResult(int(start["status"]), headers, [body for _, body in chunks], first)


def build_app(deps: Any) -> Any:
    """The real facade over the suite dependency bundle (no process-wide settings)."""
    context = pipeline.PipelineContext(
        deps=deps,
        catalog=load_catalog(ROOT / "api" / "errors.json"),
        env={},
        origin_guard=create_request_origin_guard({}),
        rate_limiter=create_rate_limiter(Settings(app_env="test"), deps.db, deps.clock),
        idempotency=IdempotencyStore(deps.db, deps.clock),
    )
    return create_app(Settings(app_env="test"), context=context)


def stub_identity(monkeypatch: pytest.MonkeyPatch, actor: Actor) -> None:
    """The bearer and legal-version guards of the pipeline, replaced by the seeded learner."""

    async def authenticate(*args: Any, **kwargs: Any) -> Actor:
        return actor

    async def legal(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(pipeline, "authenticate", authenticate)
    monkeypatch.setattr(pipeline, "assert_legal_acceptance", legal)


async def test_the_route_answers_the_ai_sdk_stream_with_the_oracle_order(
    database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def run(tx: Tx) -> FacadeResult:
        seed = await seed_tutor(tx)
        stub_identity(monkeypatch, actor_for(seed["user"]))
        app = build_app(tutor_deps(tx))
        return await call(
            app,
            f"/api/v1/conversations/{seed['conversation']}/messages",
            {"text": "Bonjour", "context": {"include": {}}},
        )

    result = await rolled_back(database, run)
    assert result.status == 200
    assert result.headers["content-type"] == STREAM_CONTENT_TYPE
    assert result.headers["cache-control"] == "no-store"
    assert result.headers["x-vercel-ai-ui-message-stream"] == "v1"
    assert result.headers["x-served-by"] == "learny-api"
    assert result.headers["x-request-id"]
    assert result.body.endswith(b"data: [DONE]\n\n")
    oracle_frames = ORACLE["sse"]["chat"][0]["frames"]
    oracle_types = [
        json.loads(frame[len("data: ") :])["type"] for frame in oracle_frames if frame != "data: [DONE]\n\n"
    ]
    assert [payload["type"] for payload in result.payloads()] == oracle_types
    for frame in result.body.decode("utf-8").split("\n\n"):
        if frame == "" or frame == "data: [DONE]":
            continue
        assert frame.startswith("data: {")
        json.loads(frame[len("data: ") :])


async def test_the_first_chunk_arrives_within_the_bound(
    database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def run(tx: Tx) -> FacadeResult:
        seed = await seed_tutor(tx)
        stub_identity(monkeypatch, actor_for(seed["user"]))
        app = build_app(tutor_deps(tx))
        return await call(
            app,
            f"/api/v1/conversations/{seed['conversation']}/messages",
            {"text": "Bonjour", "context": {"include": {}}},
        )

    result = await rolled_back(database, run)
    assert result.first_chunk_ms is not None
    assert len(result.chunks) > 1
    assert result.first_chunk_ms < FIRST_CHUNK_MAX_MS, f"first chunk took {result.first_chunk_ms:.1f} ms"
    print(f"first SSE chunk latency: {result.first_chunk_ms:.1f} ms")
    recorded = result.payloads()[0]
    assert recorded["type"] == "start"
    assert isinstance(recorded["messageId"], str)
    assert len(recorded["messageId"]) == 36


async def test_a_foreign_conversation_is_a_problem_before_any_stream(
    database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def run(tx: Tx) -> FacadeResult:
        owner = await seed_tutor(tx, "Proprietaire")
        intruder = await seed_tutor(tx, "Intrus", with_conversation=False)
        stub_identity(monkeypatch, actor_for(intruder["user"]))
        app = build_app(tutor_deps(tx))
        return await call(
            app,
            f"/api/v1/conversations/{owner['conversation']}/messages",
            {"text": "Bonjour", "context": {"include": {}}},
        )

    result = await rolled_back(database, run)
    assert result.status == 404
    assert result.headers["content-type"].startswith("application/problem+json")
    assert b"data:" not in result.body


async def call_and_disconnect(app: Any, path: str, payload: dict[str, Any]) -> FacadeResult:
    """One POST whose client drops the moment the first body chunk leaves the writer."""
    body = json.dumps(payload).encode("utf-8")
    messages: list[tuple[float, dict[str, Any]]] = []
    started = time.perf_counter()
    consumed = False
    delivered = asyncio.Event()
    dropped = False

    async def receive() -> dict[str, Any]:
        nonlocal consumed
        if not consumed:
            consumed = True
            return {"type": "http.request", "body": body, "more_body": False}
        await delivered.wait()
        return {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        nonlocal dropped
        messages.append((time.perf_counter(), message))
        if message["type"] == "http.response.body" and message["body"] != b"" and not dropped:
            dropped = True
            delivered.set()

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "root_path": "",
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
            (b"authorization", b"Bearer suite-token"),
            (b"sec-fetch-site", b"same-origin"),
        ],
        "client": ("127.0.0.1", 41235),
        "server": ("testserver", 80),
    }
    await app(scope, receive, send)
    start = next(message for _, message in messages if message["type"] == "http.response.start")
    chunks = [
        (at, message["body"])
        for at, message in messages
        if message["type"] == "http.response.body" and message["body"] != b""
    ]
    headers = {key.decode("utf-8").lower(): value.decode("utf-8") for key, value in start["headers"]}
    first = None if not chunks else (chunks[0][0] - started) * 1000.0
    return FacadeResult(int(start["status"]), headers, [body for _, body in chunks], first)


class SlowGateway(RecordingGateway):
    """One slow chunk, so the disconnect lands while the model stream is awaited."""

    async def stream(self, *args: Any, **kwargs: Any) -> Any:
        yield "Bonjour"
        await asyncio.sleep(0.05)
        yield " le monde."


async def test_a_client_disconnect_cancels_the_stream_without_leaking(
    database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def run(tx: Tx) -> tuple[set[str], int, bytes]:
        seed = await seed_tutor(tx)
        stub_identity(monkeypatch, actor_for(seed["user"]))
        app = build_app(tutor_deps(tx, llm=SlowGateway()))
        result = await call_and_disconnect(
            app,
            f"/api/v1/conversations/{seed['conversation']}/messages",
            {"text": "Bonjour", "context": {"include": {}}},
        )
        counted = await tx.conn.execute(
            text(
                "select count(*)::int as total from public.tutor_messages "
                "where conversation_id = cast(:id as uuid) and role = 'tutor'"
            ),
            {"id": seed["conversation"]},
        )
        return set(STREAMING), int(counted.scalar_one()), result.body

    streaming, tutor_messages, body = await rolled_back(database, run)
    assert set() == streaming
    assert tutor_messages == 1
    assert not body.endswith(b"data: [DONE]\n\n")
