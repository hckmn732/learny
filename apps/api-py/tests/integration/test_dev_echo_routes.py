"""[SPEC-2207] The development echo and list routes through the facade.

The nominal answers and the development guard are checked on the real pipeline: outside
`ENABLE_SDD_PAGES`, or in production, the route answers the problem+json 404 of `devOnly` before any
authentication (SPEC-201 ET-7, CL-10).
"""

from collections.abc import AsyncIterator, Mapping
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
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND
from learny.shared.ownership import special_key
from learny_api import (
    handlers,  # noqa: F401 - registers the @handler roles
    pipeline,
)
from learny_api.generated.routes import ROUTES_BY_ID
from learny_api.guards.idempotency import IdempotencyStart
from learny_api.guards.rate_limit import RateLimitDecision
from learny_api.main import create_app
from learny_api.ownership import Ownership
from learny_api.pipeline import PipelineContext
from learny_api.special import dev_echo
from starlette.requests import Request

pytestmark = pytest.mark.spec("SPEC-2207")

ROOT = Path(__file__).resolve().parents[4]
CATALOG: dict[str, ErrorEntry] = load_catalog(ROOT / "api" / "errors.json")
NOW = datetime(2026, 11, 11, 12, 20, tzinfo=UTC)
USER_ID = "22222222-2222-4222-8222-222222222222"
ROUTE_IDS = ("dev.echo", "dev.items")


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


def context(env: Mapping[str, str | None]) -> PipelineContext:
    return PipelineContext(
        deps=Deps(),  # type: ignore[arg-type]
        catalog=CATALOG,
        env=env,
        origin_guard=OriginGuard(),  # type: ignore[arg-type]
        rate_limiter=RateLimiter(),
        idempotency=Idempotency(),  # type: ignore[arg-type]
        handlers={route_id: pipeline.HANDLERS[route_id] for route_id in ROUTE_IDS},
    )


def ownership() -> Ownership:
    return Ownership(
        operations={route_id: "py" for route_id in ROUTE_IDS},
        special={
            special_key(ROUTES_BY_ID[route_id].method, ROUTES_BY_ID[route_id].path): "py"
            for route_id in ROUTE_IDS
        },
        consumers={},
        crons={},
    )


def build_app(env: Mapping[str, str | None]) -> tuple[FastAPI, TestClient]:
    settings = Settings(
        app_env=str(env.get("APP_ENV") or "test"),
        enable_sdd_pages=env.get("ENABLE_SDD_PAGES"),
        py_hono_upstream_url="http://upstream",
        rate_limit_mode="off",
    )
    app = create_app(settings, ownership=ownership(), context=context(env))

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield

    app.router.lifespan_context = lifespan
    return app, TestClient(app)


def allow(monkeypatch: pytest.MonkeyPatch) -> None:
    async def authenticate(*args: Any, **kwargs: Any) -> Actor:
        return Actor(user_id=USER_ID, email="a@b.c", email_confirmed=True, transport="bearer")

    monkeypatch.setattr(pipeline, "authenticate", authenticate)


ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}


def test_the_echo_answers_through_the_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    allow(monkeypatch)
    dev_echo.reset_executions()
    _app, client = build_app(ENABLED)
    response = client.post(
        "/api/v1/dev/sdd/echo",
        json={"message": "bonjour"},
        headers={"x-request-id": "abcdefgh", "idempotency-key": "dev-echo-1"},
    )

    assert response.status_code == 201
    assert response.json() == {
        "message": "bonjour",
        "receivedAt": "2026-11-11T12:20:00.000Z",
        "counter": 1,
    }
    assert response.headers["x-request-id"] == "abcdefgh"
    assert response.headers["x-served-by"] == "learny-api"


def test_the_echo_business_failure_returns_its_catalog_code(monkeypatch: pytest.MonkeyPatch) -> None:
    allow(monkeypatch)
    _app, client = build_app(ENABLED)
    response = client.post(
        "/api/v1/dev/sdd/echo",
        json={"message": "x", "fail": "business"},
        headers={"idempotency-key": "dev-echo-2"},
    )

    assert response.status_code == 422
    assert response.json()["code"] == "FORMATION_LIMIT_REACHED"


def test_the_list_is_paginated_by_cursor(monkeypatch: pytest.MonkeyPatch) -> None:
    allow(monkeypatch)
    _app, client = build_app(ENABLED)
    first = client.get("/api/v1/dev/sdd/items", params={"limit": 2})

    assert first.status_code == 200
    page = first.json()
    assert [item["position"] for item in page["items"]] == [57, 56]
    assert page["nextCursor"]

    second = client.get(
        "/api/v1/dev/sdd/items",
        params={"limit": 2, "cursor": page["nextCursor"]},
    )
    assert [item["position"] for item in second.json()["items"]] == [55, 54]


def test_an_unreadable_cursor_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    allow(monkeypatch)
    _app, client = build_app(ENABLED)
    response = client.get("/api/v1/dev/sdd/items", params={"cursor": "!!"})

    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_FAILED"
    assert response.json()["errors"][0]["path"] == "query.cursor"


def test_the_guard_refuses_outside_enable_sdd_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    allow(monkeypatch)
    _app, client = build_app({"APP_ENV": "test"})
    response = client.post(
        "/api/v1/dev/sdd/echo",
        json={"message": "bonjour"},
        headers={"idempotency-key": "dev-echo-3"},
    )

    assert response.status_code == 404
    body = response.json()
    assert body["code"] == "NOT_FOUND"
    assert body["detail"] == RESOURCE_NOT_FOUND
    assert response.headers["content-type"].startswith("application/problem+json")
    assert "x-served-by" not in response.headers


def test_the_guard_refuses_in_production_even_with_the_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    allow(monkeypatch)
    _app, client = build_app({"APP_ENV": "production", "ENABLE_SDD_PAGES": "true"})
    response = client.get("/api/v1/dev/sdd/items")

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND


def test_another_flag_value_does_not_open_the_routes(monkeypatch: pytest.MonkeyPatch) -> None:
    allow(monkeypatch)
    _app, client = build_app({"APP_ENV": "test", "ENABLE_SDD_PAGES": "yes"})

    assert client.get("/api/v1/dev/sdd/items").status_code == 404
