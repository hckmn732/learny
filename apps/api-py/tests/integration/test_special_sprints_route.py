"""[SPEC-2302] The sprint planning route is served by the Python facade (SPEC-719).

`POST /api/v1/formations/:fid/sprints` is absent from `api/openapi.yaml`, so the facade declares it
with a local `RouteSpec` and hands it to the shared pipeline. These tests pin the plumbing the
pipeline gives for free: installation before the relay, authentication, the mandatory
`Idempotency-Key`, the strict body of the contract, the output validation and the replay.
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
from learny.engagement import public as engagement_public
from learny.identity.public import Actor
from learny.shared.config import Settings
from learny.shared.errors import ErrorEntry, load_catalog
from learny.shared.locale_fr import validation
from learny_api import pipeline
from learny_api.guards.idempotency import IdempotencyStart
from learny_api.guards.rate_limit import RateLimitDecision
from learny_api.main import create_app
from learny_api.ownership import Ownership
from learny_api.pipeline import Call, PipelineContext
from learny_api.special.sprints import SPRINTS_KEY, SPRINTS_ROUTE_ID
from starlette.requests import Request

pytestmark = pytest.mark.spec("SPEC-2302")

ROOT = Path(__file__).resolve().parents[4]
CATALOG: dict[str, ErrorEntry] = load_catalog(ROOT / "api" / "errors.json")
NOW = datetime(2026, 11, 11, 12, 20, tzinfo=UTC)

USER_ID = "22222222-2222-4222-8222-222222222222"
FID = "11111111-1111-4111-8111-111111111111"
EXAM = "33333333-3333-4333-8333-333333333333"
SLOT = "44444444-4444-4444-8444-444444444444"
ACTION = "55555555-5555-4555-8555-555555555555"
NOTION = "66666666-6666-4666-8666-666666666666"
KEY = "sprints-test-0001"
PATH = f"/api/v1/formations/{FID}/sprints"

RESULT: dict[str, Any] = {
    "created": 1,
    "skipped": None,
    "plans": [
        {
            "actionId": ACTION,
            "formationId": FID,
            "examSlotId": EXAM,
            "examKind": "validation_quiz",
            "examDate": "2026-11-14",
            "examTitle": "Quiz de validation Partie 1",
            "daysBefore": 3,
            "durationMin": 30,
            "notionIds": [NOTION],
            "notionLabels": ["Notion 1"],
            "targets": [
                {
                    "label": "J-K",
                    "day": "2026-11-11",
                    "slotId": SLOT,
                    "startsAt": "2026-11-11T17:30:00.000Z",
                    "endsAt": "2026-11-11T18:00:00.000Z",
                    "durationMin": 30,
                }
            ],
            "impossible": [],
            "summary": "Vos sprints de 30 min avant Quiz de validation Partie 1 : mercredi a 18:30.",
        }
    ],
}


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
    """The in-memory reservation the replay reads, with the same two states as the repository."""

    stored: dict[tuple[str, str], IdempotencyStart] = field(default_factory=dict)

    async def begin(
        self, user_id: str, key: str, method: str, route: str, params: Any, body: Any
    ) -> IdempotencyStart:
        existing = self.stored.get((user_id, key))
        return existing if existing is not None else IdempotencyStart(state="reserved")

    async def finish(self, user_id: str, key: str, status_code: int, response: Any) -> None:
        self.stored[(user_id, key)] = IdempotencyStart(
            state="replayed", status_code=status_code, response=response
        )

    async def release(self, user_id: str, key: str) -> bool:
        self.stored.pop((user_id, key), None)
        return True


@dataclass
class Deps:
    clock: Clock = field(default_factory=Clock)
    logger: Logger = field(default_factory=Logger)
    settings: Any = None
    db: Any = None


def settings_for() -> Settings:
    return Settings(
        app_env="test",
        py_hono_upstream_url="http://upstream",
        rate_limit_mode="off",
    )


def context_with(
    handlers: dict[str, Callable[[Call], Any]],
    idempotency: Idempotency,
) -> PipelineContext:
    return PipelineContext(
        deps=Deps(settings=settings_for()),  # type: ignore[arg-type]
        catalog=CATALOG,
        env={},
        origin_guard=OriginGuard(),  # type: ignore[arg-type]
        rate_limiter=RateLimiter(),
        idempotency=idempotency,  # type: ignore[arg-type]
        handlers=handlers,
    )


def ownership() -> Ownership:
    return Ownership(operations={}, special={SPRINTS_KEY: "py"}, consumers={}, crons={})


def build_app(
    handlers: dict[str, Callable[[Call], Any]] | None = None,
    idempotency: Idempotency | None = None,
) -> TestClient:
    store = idempotency or Idempotency()
    app = create_app(
        settings_for(),
        ownership=ownership(),
        context=context_with({} if handlers is None else handlers, store),
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield

    app.router.lifespan_context = lifespan
    return TestClient(app)


def allow_authentication(monkeypatch: pytest.MonkeyPatch) -> None:
    async def allow(deps: Any, headers: Any) -> Actor:
        return Actor(user_id=USER_ID, email="a@b.c", email_confirmed=True, transport="bearer")

    monkeypatch.setattr(pipeline, "authenticate", allow)


def refuse_authentication(monkeypatch: pytest.MonkeyPatch) -> None:
    async def refuse(deps: Any, headers: Any) -> None:
        return None

    monkeypatch.setattr(pipeline, "authenticate", refuse)


def test_the_route_is_installed_before_the_relay_and_requires_a_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`install` registers the route and injects its handler: an anonymous call answers 401."""
    refuse_authentication(monkeypatch)
    client = build_app()

    response = client.post(PATH, json={}, headers={"Idempotency-Key": KEY})

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"
    assert response.headers["x-served-by"] == "learny-api"


def test_the_idempotency_key_is_mandatory(monkeypatch: pytest.MonkeyPatch) -> None:
    """The contract is `idempotent: true`: without the header the answer is 400, like Hono."""
    allow_authentication(monkeypatch)
    client = build_app()

    response = client.post(PATH, json={})

    assert response.status_code == 400
    assert response.json()["code"] == "IDEMPOTENCY_KEY_REQUIRED"


def test_the_body_is_strict_and_refuses_an_unknown_key(monkeypatch: pytest.MonkeyPatch) -> None:
    allow_authentication(monkeypatch)
    client = build_app()

    response = client.post(PATH, json={"unknown": True}, headers={"Idempotency-Key": KEY})

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert body["errors"][0]["path"] == "body"
    assert body["errors"][0]["message"] == validation.unrecognized_keys(["unknown"])


def test_the_optional_exam_slot_refuses_an_explicit_null(monkeypatch: pytest.MonkeyPatch) -> None:
    """`Uuid.optional()` accepts a missing key, never `null`: same `invalid_type` as Hono."""
    allow_authentication(monkeypatch)
    client = build_app()

    response = client.post(PATH, json={"examSlotId": None}, headers={"Idempotency-Key": KEY})

    assert response.status_code == 400
    body = response.json()
    assert body["errors"] == [
        {"path": "body.examSlotId", "message": validation.invalid_type("string", "null")}
    ]


def test_a_malformed_formation_identifier_is_a_path_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    allow_authentication(monkeypatch)
    client = build_app()

    response = client.post(
        "/api/v1/formations/pas-un-uuid/sprints", json={}, headers={"Idempotency-Key": KEY}
    )

    assert response.status_code == 400
    body = response.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert body["errors"][0]["path"] == "params.fid"


def test_a_valid_run_answers_the_contract_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []

    async def stub(call: Call) -> dict[str, Any]:
        calls.append(
            {
                "fid": call.params.model_dump()["fid"],  # type: ignore[union-attr]
                "body": call.body.model_dump() if call.body is not None else None,
                "userId": call.user_id,
            }
        )
        return RESULT

    allow_authentication(monkeypatch)
    client = build_app({SPRINTS_ROUTE_ID: stub})

    response = client.post(PATH, json={}, headers={"Idempotency-Key": KEY})

    assert response.status_code == 200
    assert response.json() == RESULT
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-type"] == "application/json; charset=utf-8"
    assert response.headers["x-served-by"] == "learny-api"
    assert response.headers["server-timing"].startswith("app;dur=")
    assert calls == [{"fid": FID, "body": {"examSlotId": None}, "userId": USER_ID}]


def test_the_same_key_replays_the_recorded_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    async def stub(call: Call) -> dict[str, Any]:
        calls.append(str(call.request_id))
        return RESULT

    allow_authentication(monkeypatch)
    client = build_app({SPRINTS_ROUTE_ID: stub})

    first = client.post(PATH, json={}, headers={"Idempotency-Key": KEY})
    second = client.post(PATH, json={}, headers={"Idempotency-Key": KEY})

    assert first.status_code == 200
    assert "idempotent-replayed" not in first.headers
    assert second.status_code == 200
    assert second.headers["idempotent-replayed"] == "true"
    assert second.json() == RESULT
    assert len(calls) == 1


def test_the_installed_handler_reads_the_formation_and_the_optional_slot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The real adapter of the route: `fid` from the path, `examSlotId` from the strict body."""
    seen: dict[str, Any] = {}

    async def fake(
        deps: Any,
        actor: Any,
        formation_id: str,
        exam_slot_id: str | None = None,
    ) -> dict[str, Any]:
        seen.update(formation_id=formation_id, exam_slot_id=exam_slot_id, actor=actor)
        return RESULT

    monkeypatch.setattr(engagement_public, "plan_sprints_before_milestones", fake)
    allow_authentication(monkeypatch)
    client = build_app()

    response = client.post(PATH, json={"examSlotId": EXAM}, headers={"Idempotency-Key": KEY})

    assert response.status_code == 200
    assert response.json() == RESULT
    assert seen["formation_id"] == FID
    assert seen["exam_slot_id"] == EXAM
    assert seen["actor"].user_id == USER_ID


def test_an_invalid_output_is_a_contract_violation(monkeypatch: pytest.MonkeyPatch) -> None:
    """The output model is the local `SprintPlanResult`: a wrong shape is a 500, never a leaky 200."""

    async def broken(call: Call) -> dict[str, Any]:
        return {"created": 0, "skipped": "unknown", "plans": []}

    allow_authentication(monkeypatch)
    client = build_app({SPRINTS_ROUTE_ID: broken})

    response = client.post(PATH, json={}, headers={"Idempotency-Key": KEY})

    assert response.status_code == 500
    assert response.json()["code"] == "INTERNAL_ERROR"
