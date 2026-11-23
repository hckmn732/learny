"""[SPEC-2201] Python-owned routes are served by the pipeline, everything else still relays.

The facade registers every operation whose `api/ownership.yaml` entry is `py` before the catch-all
relay, so one test can serve a single operation without touching the real ownership table.
"""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from learny.identity.public import Actor
from learny.shared.config import Settings
from learny.shared.errors import ErrorEntry, load_catalog
from learny_api import pipeline
from learny_api.generated.routes import ROUTES_BY_ID
from learny_api.guards.idempotency import IdempotencyStart
from learny_api.guards.rate_limit import RateLimitDecision
from learny_api.main import create_app
from learny_api.ownership import Ownership
from learny_api.pipeline import Call, PipelineContext
from starlette.requests import Request
from starlette.responses import Response

pytestmark = pytest.mark.spec("SPEC-2201")

ROOT = Path(__file__).resolve().parents[4]
CATALOG: dict[str, ErrorEntry] = load_catalog(ROOT / "api" / "errors.json")
NOW = datetime(2026, 11, 11, 12, 20, tzinfo=UTC)
FID = "11111111-1111-4111-8111-111111111111"
USER_ID = "22222222-2222-4222-8222-222222222222"


class Clock:
    def now(self) -> datetime:
        return NOW


class Logger:
    def bind(self, **fields: Any) -> "Logger":
        return self

    def info(self, event: str, **fields: Any) -> None:
        pass

    def warn(self, event: str, **fields: Any) -> None:
        pass

    def error(self, event: str, **fields: Any) -> None:
        pass


@dataclass
class OriginGuard:
    def check(self, request: Request) -> None:
        pass


@dataclass
class RateLimiter:
    decision: RateLimitDecision = field(default_factory=lambda: RateLimitDecision(True, 0, 0, None))

    async def consume(self, request: Any) -> RateLimitDecision:
        return self.decision


@dataclass
class Idempotency:
    async def begin(self, *args: Any, **kwargs: Any) -> IdempotencyStart:
        return IdempotencyStart(state="reserved")

    async def finish(self, *args: Any, **kwargs: Any) -> None:
        pass

    async def release(self, *args: Any, **kwargs: Any) -> bool:
        return True


@dataclass
class Deps:
    clock: Clock = field(default_factory=Clock)
    logger: Logger = field(default_factory=Logger)
    db: Any = None
    settings: Any = None


def context_with(handlers: dict[str, Callable[[Call], Any]]) -> PipelineContext:
    return PipelineContext(
        deps=Deps(),  # type: ignore[arg-type]
        catalog=CATALOG,
        env={},
        origin_guard=OriginGuard(),  # type: ignore[arg-type]
        rate_limiter=RateLimiter(),
        idempotency=Idempotency(),  # type: ignore[arg-type]
        handlers=handlers,
    )


def ownership_with(*route_ids: str) -> Ownership:
    return Ownership(
        operations={route_id: "py" for route_id in route_ids},
        special={},
        consumers={},
        crons={},
    )


def build_app(
    route_ids: tuple[str, ...],
    handlers: dict[str, Callable[[Call], Any]],
    upstream: str = "http://upstream",
) -> tuple[FastAPI, TestClient]:
    settings = Settings(app_env="test", py_hono_upstream_url=upstream, rate_limit_mode="off")
    app = create_app(settings, ownership=ownership_with(*route_ids), context=context_with(handlers))

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield

    app.router.lifespan_context = lifespan
    return app, TestClient(app)


def install_transport(app: FastAPI, handler: Callable[[httpx.Request], httpx.Response]) -> None:
    app.state.relay_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def callback(call: Call) -> Response:
    return Response(status_code=302, headers={"location": "/"})


async def access(call: Call) -> None:
    return None


def test_a_python_route_answers_through_the_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "HANDLERS", {"auth.callback": callback})
    _app, client = build_app(("auth.callback",), {"auth.callback": callback})
    response = client.get(
        "/api/v1/auth/callback",
        params={"token_hash": "abc", "type": "magiclink"},
        headers={"x-request-id": "abcdefgh"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"] == "/"
    assert response.headers["x-request-id"] == "abcdefgh"
    assert response.headers["x-served-by"] == "learny-api"
    assert response.headers["server-timing"].startswith("app;dur=")
    assert "cache-control" not in response.headers


def test_a_ts_route_still_relays_to_hono(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "HANDLERS", {"auth.callback": callback})

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/me"
        return httpx.Response(200, json={"relayed": True})

    app, client = build_app(("auth.callback",), {"auth.callback": callback})
    install_transport(app, handler)
    response = client.get("/api/v1/me")

    assert response.status_code == 200
    assert response.json() == {"relayed": True}


def test_a_protected_python_route_still_requires_a_session(monkeypatch: pytest.MonkeyPatch) -> None:
    async def refuse(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(pipeline, "HANDLERS", {"formations.access": access})
    monkeypatch.setattr(pipeline, "authenticate", refuse)
    _app, client = build_app(("formations.access",), {"formations.access": access})
    response = client.get(f"/api/v1/formations/{FID}/access")

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


def test_a_protected_python_route_answers_204_when_authorised(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def allow(*args: Any, **kwargs: Any) -> Actor:
        return Actor(user_id=USER_ID, email="a@b.c", email_confirmed=True, transport="bearer")

    monkeypatch.setattr(pipeline, "HANDLERS", {"formations.access": access})
    monkeypatch.setattr(pipeline, "authenticate", allow)
    _app, client = build_app(("formations.access",), {"formations.access": access})
    response = client.get(f"/api/v1/formations/{FID}/access")

    assert response.status_code == 204
    assert response.content == b""
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-served-by"] == "learny-api"


def test_a_python_route_without_a_handler_fails_at_startup() -> None:
    with pytest.raises(RuntimeError, match="no handler"):
        build_app(("auth.callback",), {})


def test_the_relay_catch_all_is_registered_last(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pipeline, "HANDLERS", {"auth.callback": callback})
    app, _ = build_app(("auth.callback",), {"auth.callback": callback})
    paths = [getattr(route, "path", "") for route in app.routes]

    assert paths[-1] == "/{path:path}"
    assert paths.index(ROUTES_BY_ID["auth.callback"].path) < paths.index("/{path:path}")
