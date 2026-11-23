"""[SPEC-2003] The composed facade relays and reports upstream failures."""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from learny.shared.config import Settings
from learny_api.main import create_app

pytestmark = pytest.mark.spec("SPEC-2003")

ROOT = Path(__file__).resolve().parents[4]


Transport = Callable[[httpx.Request], httpx.Response]


def build_app(upstream: str = "http://upstream") -> tuple[FastAPI, TestClient]:
    """Builds the real app; the relay client is replaced by the caller."""
    settings = Settings(app_env="test", py_hono_upstream_url=upstream)
    app = create_app(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield

    app.router.lifespan_context = lifespan
    return app, TestClient(app)


def install_transport(app: FastAPI, handler: Transport) -> None:
    """Replaces the HTTP client used by the relay with a deterministic transport."""
    app.state.relay_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_health_is_relayed_with_the_upstream_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/health"
        return httpx.Response(200, json={"status": "ok", "version": "dev", "commit": "unknown"})

    app, client = build_app()
    install_transport(app, handler)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "dev", "commit": "unknown"}


def test_a_missing_upstream_returns_the_api_unavailable_problem() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    app, client = build_app()
    install_transport(app, handler)
    # Any path the facade does not serve itself: the catch-all relay reports the failure.
    response = client.get("/api/v1/unknown")
    assert response.status_code == 502
    body = response.json()
    assert body["code"] == "API_UNAVAILABLE"
    assert body["status"] == 502


def test_every_method_and_query_is_relayed() -> None:
    seen: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.url.query.decode()))
        return httpx.Response(204)

    app, client = build_app()
    install_transport(app, handler)
    assert client.delete("/api/v1/x?a=1").status_code == 204
    assert client.post("/api/v1/y", json={"a": 1}).status_code == 204
    assert seen == [("DELETE", "a=1"), ("POST", "")]


def test_the_contract_artefacts_are_loaded_from_the_repository() -> None:
    ownership = (ROOT / "api" / "ownership.yaml").read_text("utf-8")
    assert "operations:" in ownership
    assert (ROOT / "api" / "errors.json").exists()
    app, _client = build_app()
    assert app.state.ownership.operations["health.get"] == "py"
    assert app.state.ownership.special["GET /api/v1/health"] == "py"
