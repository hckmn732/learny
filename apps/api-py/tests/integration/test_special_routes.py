"""[SPEC-2207] The special routes of the inventory served by Python.

`GET /api/v1/health` traverses the pipeline without a development guard; the `_dev` tooling
endpoints and the relay stream carry the two distinct flags of the TypeScript backend (`true` or
`1` for the demonstration routes, the exact value `true` for the tools).
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
from learny.shared.config import Settings
from learny.shared.errors import ErrorEntry, load_catalog
from learny.shared.locale_fr.details import INVALID_REQUEST_TITLE, RESOURCE_NOT_FOUND
from learny_api import (
    handlers,  # noqa: F401 - registers the @handler roles
    pipeline,
)
from learny_api.guards.idempotency import IdempotencyStart
from learny_api.guards.rate_limit import RateLimitDecision
from learny_api.main import create_app
from learny_api.ownership import Ownership
from learny_api.pipeline import PipelineContext
from learny_api.special.relay_stream import RELAY_STREAM_KEY
from learny_api.special.sdd_tools import SECRET_SCAN_KEY
from starlette.requests import Request

pytestmark = pytest.mark.spec("SPEC-2207")

ROOT = Path(__file__).resolve().parents[4]
CATALOG: dict[str, ErrorEntry] = load_catalog(ROOT / "api" / "errors.json")
NOW = datetime(2026, 11, 11, 12, 20, tzinfo=UTC)
HEALTH_KEY = "GET /api/v1/health"
OWNED_SPECIAL_KEYS = (HEALTH_KEY, RELAY_STREAM_KEY, SECRET_SCAN_KEY)


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
class Database:
    """The probe capability of the health route; a failure stands for an unreachable database."""

    failing: bool = False

    async def ping(self) -> None:
        if self.failing:
            raise RuntimeError("connection refused")


@dataclass
class Deps:
    settings: Any
    clock: Clock = field(default_factory=Clock)
    logger: Logger = field(default_factory=Logger)
    db: Database = field(default_factory=Database)


def settings_for(env: Mapping[str, str | None], *, failing: bool = False) -> Settings:
    return Settings(
        app_env=str(env.get("APP_ENV") or "test"),
        enable_sdd_pages=env.get("ENABLE_SDD_PAGES"),
        py_hono_upstream_url="http://upstream",
        rate_limit_mode="off",
        database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        app_version="1.4.2",
        git_commit="abcdef1",
    )


def context(settings: Settings, env: Mapping[str, str | None], *, failing: bool = False) -> PipelineContext:
    return PipelineContext(
        deps=Deps(settings=settings, db=Database(failing=failing)),  # type: ignore[arg-type]
        catalog=CATALOG,
        env=dict(env),
        origin_guard=OriginGuard(),  # type: ignore[arg-type]
        rate_limiter=RateLimiter(),
        idempotency=Idempotency(),  # type: ignore[arg-type]
        handlers={"health.get": pipeline.HANDLERS["health.get"]},
    )


def ownership() -> Ownership:
    return Ownership(
        operations={"health.get": "py"},
        special={key: "py" for key in OWNED_SPECIAL_KEYS},
        consumers={},
        crons={},
    )


def build_app(env: Mapping[str, str | None], *, failing: bool = False) -> tuple[FastAPI, TestClient]:
    settings = settings_for(env, failing=failing)
    app = create_app(settings, ownership=ownership(), context=context(settings, env, failing=failing))

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield

    app.router.lifespan_context = lifespan
    return app, TestClient(app)


ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}


# --- GET /api/v1/health -------------------------------------------------------------------------


def test_the_health_probe_answers_the_contract_document() -> None:
    _app, client = build_app(ENABLED)
    response = client.get("/api/v1/health", headers={"x-request-id": "abcdefgh"})

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-type"] == "application/json; charset=utf-8"
    assert response.headers["x-request-id"] == "abcdefgh"
    assert response.headers["x-served-by"] == "learny-api"
    assert response.headers["server-timing"].startswith("app;dur=")
    assert response.json() == {
        "status": "ok",
        "version": "1.4.2",
        "commit": "abcdef1",
        "database": "ok",
        "components": {"database": "ok", "build": "ok"},
    }


def test_the_health_probe_is_public_and_ignores_the_development_flag() -> None:
    _app, client = build_app({"APP_ENV": "production"})

    assert client.get("/api/v1/health").status_code == 200


def test_an_unavailable_database_answers_503_and_a_degraded_status() -> None:
    _app, client = build_app(ENABLED, failing=True)
    response = client.get("/api/v1/health")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"] == "unavailable"
    assert body["components"] == {"database": "unavailable", "build": "ok"}


# --- GET /api/v1/dev/sdd/relay-stream ------------------------------------------------------------


def test_the_relay_stream_publishes_three_fragments() -> None:
    _app, client = build_app(ENABLED)
    response = client.get("/api/v1/dev/sdd/relay-stream")

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/event-stream; charset=utf-8"
    assert response.headers["cache-control"] == "no-store"
    assert response.text == "data: fragment-1\n\ndata: fragment-2\n\ndata: fragment-3\n\n"


def test_the_relay_stream_opens_on_the_one_flag() -> None:
    _app, client = build_app({"APP_ENV": "test", "ENABLE_SDD_PAGES": "1"})
    response = client.get("/api/v1/dev/sdd/relay-stream")

    assert response.status_code == 200
    assert response.text.startswith("data: fragment-1")


def test_the_relay_stream_is_refused_outside_the_flag() -> None:
    _app, client = build_app({"APP_ENV": "test"})
    response = client.get("/api/v1/dev/sdd/relay-stream")

    assert response.status_code == 404
    assert response.json()["code"] == "NOT_FOUND"
    assert response.json()["detail"] == RESOURCE_NOT_FOUND


def test_the_relay_stream_is_refused_in_production() -> None:
    _app, client = build_app({"APP_ENV": "production", "ENABLE_SDD_PAGES": "true"})

    assert client.get("/api/v1/dev/sdd/relay-stream").status_code == 404


# --- POST /api/v1/_dev/secret-scan ---------------------------------------------------------------


def fake(*parts: str) -> str:
    return "".join(parts)


def test_the_secret_scan_reports_one_masked_finding() -> None:
    _app, client = build_app(ENABLED)
    key = fake("sk-ant-", "api03-", "A" * 30)
    response = client.post("/api/v1/_dev/secret-scan", json={"text": f"ANTHROPIC_API_KEY={key}"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {
        "findings": [{"file": "saisie", "line": 1, "rule": "anthropic-key", "preview": "sk-a\u2026"}]
    }


def test_the_secret_scan_answers_no_finding_for_a_harmless_text() -> None:
    _app, client = build_app(ENABLED)

    response = client.post("/api/v1/_dev/secret-scan", json={"text": "rien a signaler"})

    assert response.status_code == 200
    assert response.json() == {"findings": []}


def test_an_invalid_body_answers_the_four_field_problem() -> None:
    _app, client = build_app(ENABLED)
    response = client.post("/api/v1/_dev/secret-scan", json={"text": 42})

    assert response.status_code == 400
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json() == {
        "type": "about:blank",
        "title": INVALID_REQUEST_TITLE,
        "status": 400,
        "code": "VALIDATION_FAILED",
    }


def test_an_unreadable_body_answers_the_same_problem() -> None:
    _app, client = build_app(ENABLED)
    response = client.post(
        "/api/v1/_dev/secret-scan",
        content=b"{not json",
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_the_tooling_endpoint_needs_the_exact_true_flag() -> None:
    _app, client = build_app({"APP_ENV": "test", "ENABLE_SDD_PAGES": "1"})
    response = client.post("/api/v1/_dev/secret-scan", json={"text": "x"})

    assert response.status_code == 404
    assert response.content == b""


def test_the_tooling_endpoint_is_closed_in_production() -> None:
    _app, client = build_app({"APP_ENV": "production", "ENABLE_SDD_PAGES": "true"})
    response = client.post("/api/v1/_dev/secret-scan", json={"text": "x"})

    assert response.status_code == 404
    assert response.content == b""
