"""[SPEC-2201] The pipeline serves the operations of the contract and refuses a missing handler.

The facade registers every operation of `ROUTES`, so a test can serve one of them with fake guards
and a stub handler without opening a database connection; a path the contract does not declare
answers the default 404 of Starlette (SPEC-2302).
"""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from learny.identity.public import Actor
from learny.shared.config import Settings
from learny.shared.errors import ErrorEntry, load_catalog
from learny_api import handlers, pipeline  # noqa: F401 - handlers registers roles
from learny_api.guards.idempotency import IdempotencyStart
from learny_api.guards.rate_limit import RateLimitDecision
from learny_api.main import create_app
from learny_api.pipeline import Call, PipelineContext
from starlette.requests import Request

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


def context_with(registry: dict[str, Callable[[Call], Any]]) -> PipelineContext:
    return PipelineContext(
        deps=Deps(),  # type: ignore[arg-type]
        catalog=CATALOG,
        env={},
        origin_guard=OriginGuard(),  # type: ignore[arg-type]
        rate_limiter=RateLimiter(),
        idempotency=Idempotency(),  # type: ignore[arg-type]
        handlers=registry,
    )


def build_app(overrides: dict[str, Callable[[Call], Any]] | None = None) -> tuple[FastAPI, TestClient]:
    """The real registry, with the handler of the route under test replaced by a stub."""
    registry = dict(pipeline.HANDLERS)
    registry.update(overrides or {})
    settings = Settings(app_env="test", rate_limit_mode="off")
    app = create_app(settings, context=context_with(registry))

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield

    app.router.lifespan_context = lifespan
    return app, TestClient(app)


async def access(call: Call) -> None:
    return None


def test_a_protected_route_still_requires_a_session(monkeypatch: pytest.MonkeyPatch) -> None:
    async def refuse(*args: Any, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(pipeline, "authenticate", refuse)
    _app, client = build_app({"formations.access": access})
    response = client.get(f"/api/v1/formations/{FID}/access")

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


def test_a_protected_route_answers_204_when_authorised(monkeypatch: pytest.MonkeyPatch) -> None:
    async def allow(*args: Any, **kwargs: Any) -> Actor:
        return Actor(user_id=USER_ID, email="a@b.c", email_confirmed=True, transport="bearer")

    monkeypatch.setattr(pipeline, "authenticate", allow)
    _app, client = build_app({"formations.access": access})
    response = client.get(f"/api/v1/formations/{FID}/access")

    assert response.status_code == 204
    assert response.content == b""
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-served-by"] == "learny-api"


def test_a_route_without_a_handler_fails_at_startup() -> None:
    partial = dict(pipeline.HANDLERS)
    del partial["formations.access"]

    with pytest.raises(RuntimeError, match="no handler"):
        pipeline.install(FastAPI(), context_with(partial))


def test_an_undeclared_path_answers_the_default_404() -> None:
    _app, client = build_app()

    response = client.get("/api/v1/unknown")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
