"""The generic contract pipeline (SPEC-2201, ADR-2012).

The order is normative and identical: request id, origin, rate limit, idempotency key,
authentication, validation, idempotency, legal acceptance, handler, output validation, response
headers. FastAPI is only the ASGI host: it matches the path, and everything else (body reading,
validation, error rendering) happens here.
"""

import json
import re
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from fastapi import FastAPI, Request
from learny.identity.public import (
    Actor,
    assert_fresh,
    assert_legal_acceptance,
    authenticate,
)
from learny.platform.llm.caller import ai_caller
from learny.shared.errors import AppError, ErrorEntry, to_problem
from learny.shared.ids import new_id
from learny.shared.jsonx import dumps
from learny.shared.locale_fr.details import (
    EMAIL_NOT_CONFIRMED,
    INVALID_JSON_BODY,
    PAYLOAD_TOO_LARGE,
    RATE_LIMITED,
    UNAUTHENTICATED,
)
from pydantic import BaseModel, ValidationError
from starlette.responses import Response

from learny_api.generated.routes import ROUTES, RouteSpec
from learny_api.guards.idempotency import (
    IDEMPOTENCY_KEY_HEADER,
    IdempotencyStart,
    IdempotencyStore,
    read_idempotency_key,
)
from learny_api.guards.origin import (
    RequestOriginGuard,
    client_address,
    create_request_origin_guard,
    settings_env,
)
from learny_api.guards.rate_limit import RateLimitRequest, create_rate_limiter
from learny_api.validate import (
    apply_refinement,
    invalid_input,
    normalize_params,
    query_to_object,
    validate_input,
)

if TYPE_CHECKING:
    from learny.shared.config import Settings
    from learny.shared.deps import Deps

MAX_BODY_BYTES = 1024 * 1024
API_REQUEST_ID_HEADER = "x-request-id"
API_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9-]{8,64}$")
BEARER_HEADER = re.compile(r"^Bearer\b", re.IGNORECASE)
SERVED_BY = "learny-api"
SERVER_TIMING = "app;dur={duration}"

Handler = Callable[["Call"], Awaitable[Any]]

# The registry the `@handler("<route id>")` decorator fills at import time (00-conventions section 6).
HANDLERS: dict[str, Handler] = {}


def handler(route_id: str) -> Callable[[Handler], Handler]:
    """Registers the thin adapter of one operation; a duplicate id is a programming error."""

    def decorator(function: Handler) -> Handler:
        if route_id in HANDLERS:
            raise RuntimeError(f"handler already registered for {route_id}")
        HANDLERS[route_id] = function
        return function

    return decorator


def resolve_api_request_id(value: str | None) -> str:
    """`resolveApiRequestId`: a short alphanumeric id is reused, anything else becomes a UUID."""
    if value is not None and API_REQUEST_ID_PATTERN.match(value) is not None:
        return value
    return new_id()


class ResponseHeaders:
    """Extra headers a handler adds (`Set-Cookie` of the auth routes, SPEC-202)."""

    def __init__(self) -> None:
        self._items: list[tuple[str, str]] = []

    def append(self, name: str, value: str) -> None:
        self._items.append((name, value))

    def set(self, name: str, value: str) -> None:
        lowered = name.lower()
        self._items = [(key, item) for key, item in self._items if key.lower() != lowered]
        self._items.append((name, value))

    def get(self, name: str) -> str | None:
        lowered = name.lower()
        for key, value in reversed(self._items):
            if key.lower() == lowered:
                return value
        return None

    def items(self) -> list[tuple[str, str]]:
        return list(self._items)


@dataclass(frozen=True, slots=True)
class Call:
    """What a handler receives: the request context of `route-handler.ts`, typed."""

    deps: "Deps"
    actor: Actor | None
    request_id: str
    params: BaseModel | None
    query: BaseModel | None
    body: BaseModel | None
    request: Request
    ip: str
    logger: Any
    response_headers: ResponseHeaders

    @property
    def user_id(self) -> str | None:
        return None if self.actor is None else self.actor.user_id

    @property
    def email(self) -> str | None:
        return None if self.actor is None else self.actor.email


@dataclass(frozen=True, slots=True)
class PipelineContext:
    """Everything the pipeline needs, built once at startup and passed explicitly."""

    deps: "Deps"
    catalog: Mapping[str, ErrorEntry]
    env: Mapping[str, str | None]
    origin_guard: RequestOriginGuard
    rate_limiter: Any
    idempotency: IdempotencyStore
    handlers: Mapping[str, Handler] = field(default_factory=lambda: dict(HANDLERS))


def build_context(deps: "Deps", settings: "Settings", catalog: Mapping[str, ErrorEntry]) -> PipelineContext:
    """Builds the guards from the settings; an invalid `ALLOWED_ORIGINS` fails here, at startup."""
    env = settings_env(settings)
    return PipelineContext(
        deps=deps,
        catalog=catalog,
        env=env,
        origin_guard=create_request_origin_guard(env),
        rate_limiter=create_rate_limiter(settings, deps.db, deps.clock),
        idempotency=IdempotencyStore(deps.db, deps.clock),
    )


def problem_status(error: Exception, catalog: Mapping[str, ErrorEntry]) -> int:
    """`problemStatus`: the catalog status of the error code, 500 for anything else."""
    app_error = error if isinstance(error, AppError) else AppError("INTERNAL_ERROR")
    return int(to_problem(app_error, "status-only", dict(catalog))["status"])


def api_problem_response(
    error: Exception,
    request_id: str,
    catalog: Mapping[str, ErrorEntry],
) -> Response:
    """RFC 9457 answer: same body, headers and `Retry-After` as `apiProblemResponse`."""
    app_error = error if isinstance(error, AppError) else AppError("INTERNAL_ERROR")
    problem = to_problem(app_error, request_id, dict(catalog))
    status = int(problem["status"])
    response = Response(
        content=dumps(problem),
        status_code=status,
        headers={
            "content-type": "application/problem+json; charset=utf-8",
            "cache-control": "no-store",
            API_REQUEST_ID_HEADER: request_id,
        },
    )
    if app_error.retry_after is not None and status < 500:
        response.headers["retry-after"] = str(app_error.retry_after)
    return response


async def handle(spec: RouteSpec, request: Request, context: PipelineContext) -> Response:
    """Runs the twelve steps for one request; every failure becomes a problem+json answer."""
    request_id = resolve_api_request_id(request.headers.get(API_REQUEST_ID_HEADER))
    started_at = context.deps.clock.now()
    extra = ResponseHeaders()
    state: dict[str, Any] = {"actor": None, "reservation": None}

    def duration() -> int:
        elapsed = context.deps.clock.now() - started_at
        return max(0, int(elapsed.total_seconds() * 1000))

    def logger() -> Any:
        actor: Actor | None = state["actor"]
        fields: dict[str, Any] = {"route": spec.id, "requestId": request_id}
        if actor is not None:
            fields["userId"] = actor.user_id
        return context.deps.logger.bind(**fields)

    async def fail(error: Exception) -> Response:
        status = problem_status(error, context.catalog)
        problem = api_problem_response(error, request_id, context.catalog)
        await _settle_idempotency(error, status, problem)
        fields = {
            "method": request.method,
            "status": status,
            "code": error.code if isinstance(error, AppError) else "INTERNAL_ERROR",
            "durationMs": duration(),
        }
        if status >= 500:
            logger().error("request failed", **fields)
        else:
            logger().warn("request failed", **fields)
        response = _merge(problem, extra)
        response.headers["server-timing"] = SERVER_TIMING.format(duration=duration())
        response.headers["x-served-by"] = SERVED_BY
        return response

    async def _settle_idempotency(error: Exception, status: int, problem: Response) -> None:
        held = state["reservation"]
        if held is None:
            return
        state["reservation"] = None
        user_id, key = held
        try:
            if status >= 500:
                await context.idempotency.release(user_id, key)
            else:
                body = json.loads(bytes(problem.body))
                await context.idempotency.finish(user_id, key, status, body)
        except Exception as cleanup:  # a failed cleanup never masks the real error
            logger().error("idempotency cleanup failed", code="INTERNAL_ERROR", error=str(cleanup))

    async def limit(limited_user_id: str | None) -> None:
        if spec.rate_limit == "none":
            return
        decision = await context.rate_limiter.consume(
            RateLimitRequest(
                profile=spec.rate_limit,
                user_id=limited_user_id,
                ip=ip,
                route_id=spec.id,
            ),
        )
        if decision.limit > 0:
            extra.set("ratelimit-limit", str(decision.limit))
            extra.set("ratelimit-remaining", str(decision.remaining))
        if not decision.allowed:
            seconds = decision.retry_after_sec if decision.retry_after_sec is not None else 1
            raise AppError(
                "RATE_LIMITED",
                RATE_LIMITED.format(seconds=seconds),
                retry_after=seconds,
            )

    actor: Actor | None = None
    ip = client_address(request, context.env)
    try:
        # 2. origin, before the limiter and before the body is read: a refusal costs no token
        context.origin_guard.check(request)

        # 3. rate limit: a public route is limited by address before anything else
        if spec.auth == "public":
            await limit(None)

        if spec.idempotent or spec.requires_idempotency_key:
            read_idempotency_key(request.headers.get(IDEMPOTENCY_KEY_HEADER))

        # 4. authentication, then the learner's own bucket
        if spec.auth == "user" or spec.fresh_auth:
            actor = await authenticate(context.deps, request.headers)
            presented = BEARER_HEADER.match(request.headers.get("authorization") or "") is not None
            if actor is None and (spec.auth == "user" or presented):
                raise AppError("UNAUTHENTICATED", UNAUTHENTICATED)
            if actor is not None and spec.fresh_auth:
                actor = await assert_fresh(context.deps, actor, request.headers)
            if actor is not None and not actor.email_confirmed:
                raise AppError("EMAIL_NOT_CONFIRMED", EMAIL_NOT_CONFIRMED)
            if actor is not None:
                state["actor"] = actor
                await limit(actor.user_id)

        # 5. validation of the three inputs
        params = _validate_params(spec, request)
        query = _validate_query(spec, request)
        body = await _validate_body(spec, request)

        # 6. idempotency: replay the recorded answer, or reserve the key
        if spec.idempotent and actor is not None:
            key = read_idempotency_key(request.headers.get(IDEMPOTENCY_KEY_HEADER))
            started = await context.idempotency.begin(
                actor.user_id,
                key,
                spec.method,
                spec.path,
                _dump(params),
                _dump(body),
            )
            if started.state == "replayed":
                return _replay(spec, request_id, started, extra, duration(), logger())
            state["reservation"] = (actor.user_id, key)

        # 7-9. service, errors, output contract
        if spec.legal_acceptance:
            if actor is None:
                raise AppError("UNAUTHENTICATED", UNAUTHENTICATED)
            await assert_legal_acceptance(context.deps, actor, spec.id)
        function = context.handlers[spec.id]
        with ai_caller(None if actor is None else actor.user_id, request.path_params.get("fid")):
            payload = await function(
                Call(
                    deps=context.deps,
                    actor=actor,
                    request_id=request_id,
                    params=params,
                    query=query,
                    body=body,
                    request=request,
                    ip=ip if ip is not None else "unknown",
                    logger=logger(),
                    response_headers=extra,
                ),
            )
        if isinstance(payload, Response):
            return _direct(spec, request_id, payload, extra, duration())
        checked = _check_output(spec, payload, logger())
        return await _success(spec, request_id, checked, extra, duration(), logger(), state, context)

    except Exception as error:  # the pipeline converts every failure into a problem answer
        return await fail(error)


def _validate_params(spec: RouteSpec, request: Request) -> BaseModel | None:
    if spec.params is None:
        return None
    raw = normalize_params(spec.id, dict(request.path_params), status=spec.validation_status)
    return validate_input(spec.params, raw, "params", status=spec.validation_status, route_id=spec.id)


def _validate_query(spec: RouteSpec, request: Request) -> BaseModel | None:
    if spec.query is None:
        return None
    items: Iterable[tuple[str, str]] = request.query_params.multi_items()
    return validate_input(
        spec.query,
        query_to_object(items),
        "query",
        status=spec.validation_status,
        route_id=spec.id,
    )


async def _validate_body(spec: RouteSpec, request: Request) -> BaseModel | None:
    if spec.body is None:
        return None
    value = await read_json_body(request)
    parsed = validate_input(
        spec.body,
        value,
        "body",
        status=spec.validation_status,
        strict=True,
        route_id=spec.id,
    )
    apply_refinement(spec.id, value, status=spec.validation_status)
    return parsed


async def read_json_body(request: Request) -> Any:
    """1 MiB cap, `json.loads`, and the same two errors as `readJsonBody`."""
    declared = _declared_length(request.headers.get("content-length"))
    if declared > MAX_BODY_BYTES:
        raise AppError("PAYLOAD_TOO_LARGE", PAYLOAD_TOO_LARGE)
    raw = await request.body()
    if len(raw) > MAX_BODY_BYTES:
        raise AppError("PAYLOAD_TOO_LARGE", PAYLOAD_TOO_LARGE)
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise invalid_input("body", INVALID_JSON_BODY) from error


def _declared_length(value: str | None) -> int:
    try:
        return int(value or "0")
    except ValueError:
        return 0


def _dump(model: BaseModel | None) -> Any:
    return None if model is None else model.model_dump()


def _check_output(spec: RouteSpec, payload: Any, logger: Any) -> Any:
    if spec.output is None:
        return payload
    try:
        validated = spec.output.model_validate(payload)
    except ValidationError as error:
        logger.error(
            "contract_violation",
            code="INTERNAL_ERROR",
            outcome="contract_violation",
            path=",".join(".".join(str(part) for part in issue["loc"]) for issue in error.errors()),
        )
        raise AppError("INTERNAL_ERROR") from error
    return without_absent_optionals(validated.model_dump(by_alias=True), payload)


def without_absent_optionals(dumped: Any, source: Any) -> Any:
    """`zod` keeps an optional field the handler did not set absent; Pydantic fills `None`.

    Nested objects and lists are walked in parallel with the handler payload (SPEC-2202).
    """
    if isinstance(dumped, dict):
        if not isinstance(source, Mapping):
            return dumped
        return {
            key: without_absent_optionals(value, source[key])
            for key, value in dumped.items()
            if key in source
        }
    if isinstance(dumped, list):
        if not isinstance(source, list):
            return dumped
        return [
            without_absent_optionals(value, source[index]) if index < len(source) else value
            for index, value in enumerate(dumped)
        ]
    return dumped


def _replay(
    spec: RouteSpec,
    request_id: str,
    started: IdempotencyStart,
    extra: ResponseHeaders,
    duration: int,
    logger: Any,
) -> Response:
    """An idempotent replay keeps the recorded status and body, flagged by a header."""
    status = int(started.status_code or 0)
    response = _success_response(spec, request_id, status, started.response)
    if status >= 400:
        response.headers["content-type"] = "application/problem+json; charset=utf-8"
    response.headers["idempotent-replayed"] = "true"
    merged = _merge(response, extra)
    merged.headers["server-timing"] = SERVER_TIMING.format(duration=duration)
    merged.headers["x-served-by"] = SERVED_BY
    logger.info("request replayed", method=spec.method, status=status, durationMs=duration)
    return merged


async def _success(
    spec: RouteSpec,
    request_id: str,
    payload: Any,
    extra: ResponseHeaders,
    duration: int,
    logger: Any,
    state: dict[str, Any],
    context: PipelineContext,
) -> Response:
    status = 204 if spec.id == "formations.access" else spec.success_status
    response = _merge(_success_response(spec, request_id, status, payload), extra)
    response.headers["server-timing"] = SERVER_TIMING.format(duration=duration)
    response.headers["x-served-by"] = SERVED_BY
    held = state["reservation"]
    if held is not None:
        state["reservation"] = None
        user_id, key = held
        await context.idempotency.finish(user_id, key, spec.success_status, payload)
    logger.info("request completed", method=spec.method, status=status, durationMs=duration)
    return response


def _direct(
    spec: RouteSpec,
    request_id: str,
    response: Response,
    extra: ResponseHeaders,
    duration: int,
) -> Response:
    """A handler may answer with a non-JSON document (redirect of `auth-callback`, SPEC-204)."""
    response.headers[API_REQUEST_ID_HEADER] = request_id
    if spec.auth == "user":
        response.headers["cache-control"] = "no-store"
    merged = _merge(response, extra)
    merged.headers["server-timing"] = SERVER_TIMING.format(duration=duration)
    merged.headers["x-served-by"] = SERVED_BY
    return merged


def _success_response(spec: RouteSpec, request_id: str, status: int, payload: Any) -> Response:
    headers = {API_REQUEST_ID_HEADER: request_id}
    if spec.auth == "user":
        headers["cache-control"] = "no-store"
    if status == 204 or payload is None:
        return Response(status_code=status, headers=headers)
    headers["content-type"] = "application/json; charset=utf-8"
    return Response(content=dumps(payload), status_code=status, headers=headers)


def _merge(response: Response, extra: ResponseHeaders) -> Response:
    """`mergeResponseHeaders`: cookies are appended, every other extra header overwrites."""
    for name, value in extra.items():
        if name.lower() == "set-cookie":
            response.headers.append(name, value)
        else:
            response.headers[name] = value
    return response


def install(app: FastAPI, context: PipelineContext) -> list[str]:
    """Registers every operation of `ROUTES` the special registry does not serve."""
    # Imported here: `learny_api.special` imports this module for its endpoints.
    from learny_api.special import SPECIAL_ROUTE_IDS

    installed: list[str] = []
    for spec in ROUTES:
        if spec.id in SPECIAL_ROUTE_IDS:
            continue
        if spec.id not in context.handlers:
            raise RuntimeError(f"route {spec.id} has no handler")
        app.add_api_route(
            spec.path,
            _endpoint(spec, context),
            methods=[spec.method],
            include_in_schema=False,
            name=f"py:{spec.id}",
        )
        installed.append(spec.id)
    return installed


def _endpoint(spec: RouteSpec, context: PipelineContext) -> Callable[[Request], Awaitable[Response]]:
    async def endpoint(request: Request) -> Response:
        return await handle(spec, request, context)

    endpoint.__name__ = f"route_{spec.id.replace('.', '_')}"
    return endpoint
