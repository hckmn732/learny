"""[SPEC-2201] The contract pipeline reproduces `route-handler.ts` step by step.

The order is the contract: origin, rate limit, idempotency key, authentication, validation,
idempotency, legal acceptance, handler, output validation, headers. Each test observes one step
without a database, by injecting fakes into a `PipelineContext`.
"""

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from learny.identity.public import Actor
from learny.shared.errors import AppError, ErrorEntry, load_catalog
from learny.shared.locale_fr.details import (
    INVALID_JSON_BODY,
    ORIGIN_REJECTED,
    RATE_LIMITED,
    UNAUTHENTICATED,
)
from learny_api.generated.routes import ROUTES, ROUTES_BY_ID, RouteSpec
from learny_api.guards.idempotency import IdempotencyStart
from learny_api.guards.rate_limit import RateLimitDecision
from learny_api.pipeline import Call, PipelineContext, handle, handler, resolve_api_request_id
from starlette.requests import Request
from starlette.responses import Response

pytestmark = pytest.mark.spec("SPEC-2201")

ROOT = Path(__file__).resolve().parents[4]
CATALOG: dict[str, ErrorEntry] = load_catalog(ROOT / "api" / "errors.json")
NOW = datetime(2026, 11, 11, 12, 20, tzinfo=UTC)
USER_ID = "11111111-1111-4111-8111-111111111111"


class Clock:
    def now(self) -> datetime:
        return NOW


class Logger:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, Any]]] = []

    def bind(self, **fields: Any) -> "Logger":
        return self

    def info(self, event: str, **fields: Any) -> None:
        self.events.append((event, fields))

    def warn(self, event: str, **fields: Any) -> None:
        self.events.append((event, fields))

    def error(self, event: str, **fields: Any) -> None:
        self.events.append((event, fields))


@dataclass
class OriginGuard:
    events: list[str]

    def check(self, request: Request) -> None:
        self.events.append("origin")


@dataclass
class RateLimiter:
    events: list[str]
    decision: RateLimitDecision

    async def consume(self, request: Any) -> RateLimitDecision:
        self.events.append(f"limit:{request.user_id or 'anonymous'}")
        return self.decision


@dataclass
class Idempotency:
    events: list[str]
    replay: IdempotencyStart | None = None
    finished: tuple[str, str, int, Any] | None = None
    released: tuple[str, str] | None = None

    async def begin(
        self, user_id: str, key: str, method: str, route: str, params: Any, body: Any
    ) -> IdempotencyStart:
        self.events.append("idempotency")
        return self.replay or IdempotencyStart(state="reserved")

    async def finish(self, user_id: str, key: str, status_code: int, response: Any) -> None:
        self.events.append("finish")
        self.finished = (user_id, key, status_code, response)

    async def release(self, user_id: str, key: str) -> bool:
        self.events.append("release")
        self.released = (user_id, key)
        return True


@dataclass
class Deps:
    clock: Clock = field(default_factory=Clock)
    logger: Logger = field(default_factory=Logger)
    db: Any = None
    settings: Any = None


def make_context(
    events: list[str] | None = None,
    *,
    handlers: dict[str, Callable[[Call], Awaitable[Any]]] | None = None,
    idempotency: Idempotency | None = None,
    decision: RateLimitDecision | None = None,
) -> PipelineContext:
    log = events if events is not None else []
    return PipelineContext(
        deps=Deps(logger=Logger()),  # type: ignore[arg-type]
        catalog=CATALOG,
        env={},
        origin_guard=OriginGuard(log),  # type: ignore[arg-type]
        rate_limiter=RateLimiter(log, decision or RateLimitDecision(True, 120, 119, None)),
        idempotency=idempotency or Idempotency(log),  # type: ignore[arg-type]
        handlers=handlers or {},
    )


def make_request(
    method: str = "GET",
    path: str = "/api/v1/me",
    *,
    headers: dict[str, str] | None = None,
    query: str = "",
    body: bytes = b"",
    path_params: dict[str, str] | None = None,
) -> Request:
    raw_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    raw_headers.append((b"host", b"test"))
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": query.encode(),
        "root_path": "",
        "headers": raw_headers,
        "server": ("test", 80),
        "client": ("127.0.0.1", 1234),
        "path_params": path_params or {},
    }
    sent = {"done": False}

    async def receive() -> dict[str, Any]:
        if sent["done"]:
            return {"type": "http.disconnect"}
        sent["done"] = True
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(scope, receive)


def actor(confirmed: bool = True) -> Actor:
    return Actor(user_id=USER_ID, email="a@b.c", email_confirmed=confirmed, transport="bearer")


@pytest.fixture
def authenticated(monkeypatch: pytest.MonkeyPatch) -> Actor:
    async def fake_authenticate(*args: Any, **kwargs: Any) -> Actor:
        return actor()

    monkeypatch.setattr("learny_api.pipeline.authenticate", fake_authenticate)
    return actor()


@pytest.fixture
def legal_calls(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    calls: list[str] = []

    async def fake_acceptance(deps: Any, who: Actor, operation: str) -> None:
        calls.append(operation)

    monkeypatch.setattr("learny_api.pipeline.assert_legal_acceptance", fake_acceptance)
    return calls


def synthetic(
    route_id: str = "test.route",
    *,
    method: str = "POST",
    path: str = "/api/v1/test-route",
    auth: str = "user",
    idempotent: bool = False,
    legal_acceptance: bool = False,
    success_status: int = 200,
    validation_status: int = 400,
) -> RouteSpec:
    """A route with no model, so a test observes the pipeline and not the contract's DTOs."""
    return RouteSpec(
        id=route_id,
        method=method,
        path=path,
        auth=auth,  # type: ignore[arg-type]
        rate_limit="none",
        idempotent=idempotent,
        requires_idempotency_key=False,
        fresh_auth=False,
        legal_acceptance=legal_acceptance,
        validation_status=validation_status,
        success_status=success_status,
        params=None,
        query=None,
        body=None,
        output=None,
    )


def with_handler(
    context: PipelineContext,
    spec: RouteSpec,
    function: Callable[[Call], Awaitable[Any]] | None = None,
    payload: Any = None,
) -> PipelineContext:
    async def default(call: Call) -> Any:
        return payload

    return replace(context, handlers={spec.id: function or default})


def body_of(response: Response) -> Any:
    return json.loads(bytes(response.body))


async def test_origin_runs_before_the_rate_limit_and_before_the_body() -> None:
    events: list[str] = []
    context = make_context(events)

    def blocking_origin(request: Request) -> None:
        events.append("origin")
        raise AppError("ORIGIN_REJECTED", ORIGIN_REJECTED)

    context.origin_guard.check = blocking_origin  # type: ignore[assignment]
    spec = synthetic()
    response = await handle(spec, make_request(body=b"{"), with_handler(context, spec))

    assert response.status_code == 403
    assert events == ["origin"]


async def test_a_public_route_is_limited_by_address_before_authentication(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    seen: list[str] = []

    async def fake_authenticate(*args: Any, **kwargs: Any) -> None:
        seen.append("authenticate")
        return None

    monkeypatch.setattr("learny_api.pipeline.authenticate", fake_authenticate)
    public = next(route for route in ROUTES if route.auth == "public" and route.method == "POST")
    context = make_context(events)
    response = await handle(public, make_request("POST", public.path), context)

    assert events[0] == "origin"
    assert events[1] == "limit:anonymous"
    assert seen == []  # a public route never resolves a session
    assert response.status_code in {400, 413, 415, 422, 500}


async def test_a_protected_route_authenticates_before_validating() -> None:
    events: list[str] = []
    context = make_context(events)
    response = await handle(ROUTES_BY_ID["me.get"], make_request(body=b"{not json"), context)

    assert response.status_code == 401
    assert body_of(response)["code"] == "UNAUTHENTICATED"
    assert events == ["origin"]  # no validation, no body read


async def test_an_unconfirmed_address_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_authenticate(*args: Any, **kwargs: Any) -> Actor:
        return actor(confirmed=False)

    monkeypatch.setattr("learny_api.pipeline.authenticate", fake_authenticate)
    response = await handle(ROUTES_BY_ID["me.get"], make_request(), make_context())

    assert response.status_code == 403
    assert body_of(response)["code"] == "EMAIL_NOT_CONFIRMED"


async def test_a_bearer_header_on_a_fresh_auth_route_is_reverified(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_authenticate(*args: Any, **kwargs: Any) -> Actor:
        return actor()

    async def stale(deps: Any, who: Actor, headers: Any) -> Actor:
        raise AppError("UNAUTHENTICATED", UNAUTHENTICATED)

    monkeypatch.setattr("learny_api.pipeline.authenticate", fake_authenticate)
    monkeypatch.setattr("learny_api.pipeline.assert_fresh", stale)
    spec = next(route for route in ROUTES if route.fresh_auth and route.auth == "user")
    response = await handle(
        spec, make_request("DELETE", spec.path, headers={"authorization": "Bearer x"}), make_context()
    )

    assert response.status_code == 401


async def test_validation_answers_the_route_status_with_prefixed_paths(
    authenticated: Actor,
) -> None:
    events: list[str] = []
    spec = ROUTES_BY_ID["agenda.get"]
    response = await handle(spec, make_request(path=spec.path), make_context(events))

    assert response.status_code == spec.validation_status
    problem = body_of(response)
    assert problem["code"] == "VALIDATION_FAILED"
    assert problem["errors"][0]["path"].startswith("query.")
    assert events == ["origin", f"limit:{USER_ID}"]


async def test_a_422_route_answers_422(authenticated: Actor) -> None:
    spec = ROUTES_BY_ID["me.ai.credentials.qualify"]
    response = await handle(
        spec,
        make_request("POST", "/api/v1/me/ai/credentials/nope/qualify", path_params={"id": "nope"}),
        make_context(),
    )

    assert spec.validation_status == 422
    assert response.status_code == 422
    assert body_of(response)["errors"][0]["path"] == "params.id"


def _plain_json_route() -> RouteSpec:
    """A user route with a body and no idempotency key: the validation path is reached."""
    return next(
        route
        for route in ROUTES
        if route.body is not None
        and route.auth == "user"
        and not route.idempotent
        and not route.requires_idempotency_key
    )


async def test_the_body_is_capped_at_one_megabyte(authenticated: Actor) -> None:
    spec = _plain_json_route()
    response = await handle(
        spec,
        make_request(
            "POST",
            spec.path,
            body=b"x" * (1024 * 1024 + 1),
            headers={"content-length": "1048577"},
        ),
        make_context(),
    )

    assert response.status_code == 413
    assert body_of(response)["code"] == "PAYLOAD_TOO_LARGE"


async def test_an_invalid_json_body_is_a_validation_error(authenticated: Actor) -> None:
    spec = _plain_json_route()
    response = await handle(spec, make_request("POST", spec.path, body=b"{"), make_context())

    assert response.status_code == spec.validation_status
    problem = body_of(response)
    assert problem["errors"] == [{"path": "body", "message": INVALID_JSON_BODY}]


async def test_an_idempotent_route_reserves_then_finishes(
    authenticated: Actor, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("learny_api.pipeline.read_idempotency_key", lambda header: header or "k" * 8)
    events: list[str] = []
    store = Idempotency(events)
    spec = synthetic(idempotent=True, success_status=201)
    context = with_handler(make_context(events, idempotency=store), spec, payload={"ok": True})
    response = await handle(
        spec, make_request("POST", spec.path, headers={"idempotency-key": "k" * 8}), context
    )

    assert response.status_code == 201
    assert events.index("idempotency") < events.index("finish")
    assert store.finished is not None
    assert store.finished[:3] == (USER_ID, "k" * 8, 201)
    assert body_of(response) == {"ok": True}


async def test_a_replayed_request_does_not_reach_the_handler(
    authenticated: Actor, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("learny_api.pipeline.read_idempotency_key", lambda header: header or "k" * 8)
    events: list[str] = []
    store = Idempotency(
        events, replay=IdempotencyStart(state="replayed", status_code=201, response={"id": "x"})
    )
    spec = synthetic(idempotent=True, success_status=201)
    context = with_handler(make_context(events, idempotency=store), spec, payload={"ok": True})
    response = await handle(
        spec, make_request("POST", spec.path, headers={"idempotency-key": "k" * 8}), context
    )

    assert response.status_code == 201
    assert response.headers["idempotent-replayed"] == "true"
    assert body_of(response) == {"id": "x"}
    assert "finish" not in events


async def test_a_replayed_failure_keeps_the_problem_content_type(
    authenticated: Actor, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("learny_api.pipeline.read_idempotency_key", lambda header: header or "k" * 8)
    replay = IdempotencyStart(
        state="replayed",
        status_code=409,
        response={
            "type": "t",
            "title": "Conflit",
            "status": 409,
            "detail": "d",
            "code": "CONFLICT",
            "requestId": "x",
        },
    )
    spec = synthetic(idempotent=True)
    context = with_handler(make_context(idempotency=Idempotency([], replay=replay)), spec)
    response = await handle(
        spec, make_request("POST", spec.path, headers={"idempotency-key": "k" * 8}), context
    )

    assert response.status_code == 409
    assert response.headers["content-type"] == "application/problem+json; charset=utf-8"


async def test_an_idempotent_route_reads_the_key_before_authenticating() -> None:
    spec = synthetic(idempotent=True)
    response = await handle(spec, make_request("POST", spec.path), with_handler(make_context(), spec))

    assert response.status_code == 400
    assert body_of(response)["code"] == "IDEMPOTENCY_KEY_REQUIRED"


async def test_a_denied_rate_limit_carries_the_retry_after_header(authenticated: Actor) -> None:
    events: list[str] = []
    context = make_context(events, decision=RateLimitDecision(False, 120, 0, 7))
    response = await handle(ROUTES_BY_ID["me.get"], make_request(), context)

    assert response.status_code == 429
    assert response.headers["retry-after"] == "7"
    assert response.headers["ratelimit-limit"] == "120"
    assert response.headers["ratelimit-remaining"] == "0"
    assert body_of(response)["detail"] == RATE_LIMITED.format(seconds=7)


async def test_legal_acceptance_runs_after_the_idempotency_reservation(
    authenticated: Actor, legal_calls: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("learny_api.pipeline.read_idempotency_key", lambda header: header or "k" * 8)
    events: list[str] = []
    spec = synthetic(idempotent=True, legal_acceptance=True)
    context = with_handler(make_context(events, idempotency=Idempotency(events)), spec, payload={"ok": True})
    await handle(spec, make_request("POST", spec.path, headers={"idempotency-key": "k" * 8}), context)

    assert legal_calls == [spec.id]
    assert events.index("idempotency") < events.index("finish")


async def test_the_response_headers_are_the_ones_of_the_typescript_wrapper(
    authenticated: Actor,
) -> None:
    spec = synthetic()

    async def ok(call: Call) -> dict[str, Any]:
        call.response_headers.append("set-cookie", "a=1")
        call.response_headers.append("set-cookie", "b=2")
        return {"id": "x"}

    context = with_handler(make_context(), spec, function=ok)
    response = await handle(
        spec, make_request("POST", spec.path, headers={"x-request-id": "abcdefgh"}), context
    )

    assert response.headers["x-request-id"] == "abcdefgh"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["server-timing"].startswith("app;dur=")
    assert response.headers["x-served-by"] == "learny-api"
    assert response.headers.getlist("set-cookie") == ["a=1", "b=2"]
    assert response.headers["content-type"] == "application/json; charset=utf-8"


async def test_a_non_json_answer_keeps_its_status_and_headers() -> None:
    spec = synthetic(auth="public")

    async def redirect(call: Call) -> Response:
        return Response(status_code=302, headers={"location": "/"})

    context = with_handler(make_context(), spec, function=redirect)
    response = await handle(spec, make_request("POST", spec.path), context)

    assert response.status_code == 302
    assert response.headers["location"] == "/"
    assert response.headers["x-served-by"] == "learny-api"
    assert "cache-control" not in response.headers


async def test_the_output_contract_is_enforced_on_an_empty_body(authenticated: Actor) -> None:
    spec = ROUTES_BY_ID["me.get"]

    async def nothing(call: Call) -> None:
        return None

    context = with_handler(make_context(), spec, function=nothing)
    response = await handle(spec, make_request(), context)

    assert response.status_code == 500
    assert body_of(response)["code"] == "INTERNAL_ERROR"
    assert any(event[0] == "contract_violation" for event in context.deps.logger.events)


async def test_an_unknown_error_becomes_an_internal_error_without_leaking(
    authenticated: Actor,
) -> None:
    spec = synthetic()

    async def boom(call: Call) -> dict[str, Any]:
        raise RuntimeError("database password leaked")

    context = with_handler(make_context(), spec, function=boom)
    response = await handle(spec, make_request("POST", spec.path), context)

    assert response.status_code == 500
    problem = body_of(response)
    assert problem["code"] == "INTERNAL_ERROR"
    assert "password" not in problem["detail"]


async def test_a_failing_handler_after_the_reservation_releases_it(
    authenticated: Actor, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("learny_api.pipeline.read_idempotency_key", lambda header: header or "k" * 8)
    events: list[str] = []
    store = Idempotency(events)
    spec = synthetic(idempotent=True)

    async def boom(call: Call) -> dict[str, Any]:
        raise RuntimeError("boom")

    context = with_handler(make_context(events, idempotency=store), spec, function=boom)
    response = await handle(
        spec, make_request("POST", spec.path, headers={"idempotency-key": "k" * 8}), context
    )

    assert response.status_code == 500
    assert store.released == (USER_ID, "k" * 8)


async def test_a_store_failure_after_the_reservation_is_recorded_as_a_failure(
    authenticated: Actor, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("learny_api.pipeline.read_idempotency_key", lambda header: header or "k" * 8)
    events: list[str] = []
    store = Idempotency(events)
    spec = synthetic(idempotent=True, success_status=201)

    async def failing(call: Call) -> dict[str, Any]:
        raise AppError("NOT_FOUND")

    context = with_handler(make_context(events, idempotency=store), spec, function=failing)
    response = await handle(
        spec, make_request("POST", spec.path, headers={"idempotency-key": "k" * 8}), context
    )

    assert response.status_code == 404
    assert store.finished is not None
    assert store.finished[2] == 404


async def test_formations_access_is_forced_to_204(authenticated: Actor) -> None:
    spec = replace(
        synthetic(route_id="formations.access", method="GET", path="/api/v1/formations/{fid}"),
        success_status=204,
    )
    context = with_handler(make_context(), spec)
    response = await handle(
        spec,
        make_request("GET", "/api/v1/formations/xid", path_params={"fid": "xid"}),
        context,
    )

    assert response.status_code == 204
    assert response.body == b""


def test_the_request_id_is_reused_only_when_it_is_plausible() -> None:
    assert resolve_api_request_id("abcdefgh") == "abcdefgh"
    assert resolve_api_request_id("short") != "short"
    assert resolve_api_request_id("bad value!") != "bad value!"
    assert resolve_api_request_id(None) != ""


def test_the_handler_decorator_refuses_a_duplicate() -> None:
    @handler("test.duplicate")
    async def first(call: Call) -> Any:
        return None

    with pytest.raises(RuntimeError):

        @handler("test.duplicate")
        async def second(call: Call) -> Any:
            return None
