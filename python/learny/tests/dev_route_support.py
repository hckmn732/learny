"""Harness of the development-route integration tests (SPEC-2207).

Builds the real facade over a fake dependency bundle, with a real `Database` when the test needs
one, so the nominal answer and the development guard are checked on the real pipeline (SPEC-2302
removed the ownership table that used to restrict the installed routes).
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient
from learny.shared.errors import ErrorEntry, load_catalog
from learny_api import (
    handlers,  # noqa: F401 - registers the @handler roles
    pipeline,
)
from learny_api.guards.idempotency import IdempotencyStart
from learny_api.guards.rate_limit import RateLimitDecision
from learny_api.pipeline import PipelineContext
from learny_api.special import DEVELOPMENT_ROUTE_IDS
from learny_api.special import install as install_special
from starlette.requests import Request

ROOT = Path(__file__).resolve().parents[3]
CATALOG: dict[str, ErrorEntry] = load_catalog(ROOT / "api" / "errors.json")
NOW = datetime(2026, 11, 11, 12, 20, tzinfo=UTC)
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
class DevDeps:
    """The capabilities the development use cases read; the other fields default to None."""

    db: Any = None
    clock: Clock = field(default_factory=Clock)
    logger: Logger = field(default_factory=Logger)
    email: Any = None
    email_config: Any = None
    stripe: Any = None
    webhook_journal: Any = None
    settings: Any = None
    gotrue: Any = None
    storage: Any = None
    push: Any = None
    llm: Any = None


def build_dev_app(
    route_ids: tuple[str, ...],
    deps: DevDeps,
    env: Mapping[str, str | None],
) -> tuple[FastAPI, TestClient]:
    """The real facade over `deps`; `route_ids` are the development routes under test."""
    assert set(route_ids) <= set(DEVELOPMENT_ROUTE_IDS), route_ids
    context = PipelineContext(
        deps=deps,  # type: ignore[arg-type]
        catalog=CATALOG,
        env=dict(env),
        origin_guard=OriginGuard(),  # type: ignore[arg-type]
        rate_limiter=RateLimiter(),
        idempotency=Idempotency(),  # type: ignore[arg-type]
        handlers=dict(pipeline.HANDLERS),
    )
    app = FastAPI()
    install_special(app, context)
    pipeline.install(app, context)
    return app, TestClient(app)


def allow_authentication(monkeypatch: Any, user_id: str = USER_ID) -> None:
    from learny.identity.public import Actor

    async def authenticate(*args: Any, **kwargs: Any) -> Actor:
        return Actor(user_id=user_id, email="a@b.c", email_confirmed=True, transport="bearer")

    monkeypatch.setattr(pipeline, "authenticate", authenticate)
