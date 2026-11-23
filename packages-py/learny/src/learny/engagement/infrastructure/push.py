"""Browser push channel of the engagement context (SPEC-2205, ported from `packages/notifications/src/push`).

The payload carries the minimum the service worker needs: the short title and body already written
for the in-app inbox (SPEC-109 bounds), the icon slug, an internal path and the notification
identifier used as the replace tag. Nothing personal travels through the push service.

Two transports: `mock` simulates the push service deterministically from the last path segment of
the endpoint (`success`, `missing`, `gone`, `transient`) and never opens a socket, `live` wraps
`pywebpush` with the VAPID keys, which stay on the server. A 404 or 410 deletes the subscription at
once; any other failure increments a counter and deletes at the fifth (ADR-0055).
"""

import json
import re
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol, cast
from urllib.parse import urljoin, urlparse

from learny.shared.clock import Clock
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr

PushMode = Literal["mock", "live"]
MockPushOutcome = Literal["success", "missing", "gone", "transient"]
PushFailureReason = Literal["gone", "transient"]

PUSH_TTL_SECONDS = 24 * 60 * 60
PUSH_PAYLOAD_MAX_BYTES = 4096
PUSH_REQUEST_TIMEOUT_SECONDS = 10
PUSH_MAX_FAILURES = 5
MOCK_PUSH_HOST = "push.mock.learny.app"
MOCK_PUSH_OUTCOMES: tuple[str, ...] = ("success", "missing", "gone", "transient")
GONE_STATUSES = frozenset({404, 410})
MOCK_STATUS: dict[str, int] = {"success": 201, "missing": 404, "gone": 410, "transient": 503}
PUSH_ERROR_CODES = {"noSubscription": "no_subscription", "gone": "gone", "transient": "transient"}

TITLE_MAX = 120
BODY_MAX = 400
_ICON = re.compile(r"^[a-z][a-z0-9-]{0,39}$")
_FORBIDDEN_HREF = re.compile(r"[\s\\]")


@dataclass(frozen=True, slots=True)
class PushPayload:
    """What the service worker receives in `event.data.json()` (EF-4)."""

    title: str
    body: str
    icon: str
    url: str
    tag: str

    def to_json(self) -> str:
        return json.dumps(
            {
                "title": self.title,
                "body": self.body,
                "icon": self.icon,
                "url": self.url,
                "tag": self.tag,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )


@dataclass(frozen=True, slots=True)
class PushTarget:
    endpoint: str
    p256dh: str
    auth: str


@dataclass(frozen=True, slots=True)
class PushSendResult:
    """One answer of the push service; `gone` is definitive, `transient` may be retried."""

    ok: bool
    status_code: int | None
    reason: PushFailureReason | None = None


@dataclass(frozen=True, slots=True)
class AttemptDecision:
    """The fate of one subscription after one answer (EF-5, CL-4, CL-5)."""

    removed: bool
    failure_count: int


@dataclass(frozen=True, slots=True)
class RoundSummary:
    """The journal line of one round: `sent`, else `gone` or `transient` (ET-5)."""

    status: str
    error: str | None
    retryable: bool


@dataclass(frozen=True, slots=True)
class MockPushRecord:
    """One simulated call, kept in memory for the tests and the demonstration."""

    at: str
    host: str
    outcome: str
    status_code: int
    ttl: int
    topic: str | None
    payload_bytes: int
    payload: str


class PushTransport(Protocol):
    """What the sender needs from a push transport."""

    @property
    def mode(self) -> str: ...

    async def send(
        self, target: PushTarget, payload: str, *, ttl: int, topic: str | None
    ) -> PushSendResult: ...


def classify_push_status(status_code: int) -> PushSendResult:
    """ADR-0055: 2xx sent, 404/410 the subscription is gone, anything else transient."""
    if 200 <= status_code < 300:
        return PushSendResult(ok=True, status_code=status_code)
    if status_code in GONE_STATUSES:
        return PushSendResult(ok=False, status_code=status_code, reason="gone")
    return PushSendResult(ok=False, status_code=status_code, reason="transient")


def decide_attempt(failure_count: int, result: PushSendResult) -> AttemptDecision:
    """A success resets the counter, 404/410 removes the row, the fifth failure removes it too."""
    if result.ok:
        return AttemptDecision(removed=False, failure_count=0)
    if result.reason == "gone":
        return AttemptDecision(removed=True, failure_count=0)
    following = failure_count + 1
    if following >= PUSH_MAX_FAILURES:
        return AttemptDecision(removed=True, failure_count=0)
    return AttemptDecision(removed=False, failure_count=following)


def summarize_round(attempts: Sequence[tuple[PushSendResult, bool]]) -> RoundSummary:
    """`sent` as soon as one subscription received the message, else `gone` or `transient`."""
    if any(result.ok for result, _removed in attempts):
        return RoundSummary(status="sent", error=None, retryable=False)
    all_definitive = bool(attempts) and all(removed for _result, removed in attempts)
    return RoundSummary(
        status="failed",
        error=PUSH_ERROR_CODES["gone"] if all_definitive else PUSH_ERROR_CODES["transient"],
        retryable=not all_definitive,
    )


def safe_notification_url(origin: str, candidate: object) -> str | None:
    """The only URL a click may open: an internal path resolved against the worker's origin."""
    if not isinstance(candidate, str) or candidate == "":
        return None
    if not candidate.startswith("/") or candidate.startswith("//"):
        return None
    if _FORBIDDEN_HREF.search(candidate) is not None:
        return None
    try:
        base = urlparse(origin)
        url = urlparse(urljoin(origin, candidate))
    except ValueError:
        return None
    if base.scheme == "" or base.netloc == "":
        return None
    if url.scheme != base.scheme or url.netloc != base.netloc:
        return None
    return url.geturl()


def build_push_payload(notification: Mapping[str, object]) -> PushPayload:
    """EF-4, ET-3 - builds and bounds the payload; a malformed row is refused here."""
    identifier = notification.get("id")
    title = notification.get("title")
    body = notification.get("body")
    icon = notification.get("icon")
    href = notification.get("href")
    if not _is_uuid(identifier):
        raise AppError("VALIDATION_FAILED", fr.DELIVERY_PUSH_INVALID)
    if not isinstance(title, str) or not title.strip() or len(title) > TITLE_MAX:
        raise AppError("VALIDATION_FAILED", fr.DELIVERY_PUSH_INVALID)
    if not isinstance(body, str) or not body.strip() or len(body) > BODY_MAX:
        raise AppError("VALIDATION_FAILED", fr.DELIVERY_PUSH_INVALID)
    if not isinstance(icon, str) or _ICON.match(icon) is None:
        raise AppError("VALIDATION_FAILED", fr.DELIVERY_PUSH_INVALID)
    if not isinstance(href, str) or safe_notification_url("https://learny.app", href) is None:
        raise AppError("VALIDATION_FAILED", fr.DELIVERY_PUSH_INVALID)
    payload = PushPayload(title=title, body=body, icon=icon, url=href, tag=cast(str, identifier))
    if len(payload.to_json().encode("utf-8")) > PUSH_PAYLOAD_MAX_BYTES:
        raise AppError("VALIDATION_FAILED", fr.DELIVERY_PUSH_TOO_LARGE)
    return payload


def _is_uuid(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


def mock_outcome_of(endpoint: str) -> str:
    """`mockOutcomeOf`: the last segment of the simulated endpoint, `success` for anything else."""
    try:
        path = urlparse(endpoint).path
    except ValueError:
        return "success"
    segments = [part for part in path.split("/") if part != ""]
    last = segments[-1] if segments else ""
    return last if last in MOCK_PUSH_OUTCOMES else "success"


def mock_push_endpoint(scope: str, outcome: MockPushOutcome) -> str:
    """Endpoint of the mock push service for a given outcome; `scope` keeps endpoints distinct."""
    return f"https://{MOCK_PUSH_HOST}/{scope}/{outcome}"


class MockPushTransport:
    """The deterministic push service of the tests and the demonstration (EF-6)."""

    def __init__(self, now: Callable[[], datetime]) -> None:
        self._now = now
        self._outbox: list[MockPushRecord] = []

    @property
    def mode(self) -> str:
        return "mock"

    async def send(self, target: PushTarget, payload: str, *, ttl: int, topic: str | None) -> PushSendResult:
        encoded = payload.encode("utf-8")
        if len(encoded) > PUSH_PAYLOAD_MAX_BYTES:
            raise AppError("VALIDATION_FAILED", fr.DELIVERY_PUSH_TOO_LARGE)
        outcome = mock_outcome_of(target.endpoint)
        status_code = MOCK_STATUS[outcome]
        self._outbox.append(
            MockPushRecord(
                at=self._now().isoformat(),
                host=urlparse(target.endpoint).hostname or "",
                outcome=outcome,
                status_code=status_code,
                ttl=ttl,
                topic=topic,
                payload_bytes=len(encoded),
                payload=payload,
            )
        )
        return classify_push_status(status_code)

    def records(self) -> tuple[MockPushRecord, ...]:
        return tuple(self._outbox)

    def clear(self) -> None:
        self._outbox.clear()


class WebPushTransport:
    """`pywebpush` transport: VAPID on the server, no redirection followed (ADR-0055)."""

    def __init__(self, subject: str, public_key: str, private_key: str) -> None:
        self._subject = subject
        self._public_key = public_key
        self._private_key = private_key

    @property
    def mode(self) -> str:
        return "live"

    async def send(self, target: PushTarget, payload: str, *, ttl: int, topic: str | None) -> PushSendResult:
        from pywebpush import WebPushException, webpush  # type: ignore[import-untyped]

        subscription = {
            "endpoint": target.endpoint,
            "keys": {"p256dh": target.p256dh, "auth": target.auth},
        }
        try:
            webpush(
                subscription_info=subscription,
                data=payload,
                vapid_private_key=self._private_key,
                vapid_claims={"sub": self._subject},
                ttl=ttl,
                headers={"Topic": topic} if topic is not None else None,
                timeout=PUSH_REQUEST_TIMEOUT_SECONDS,
            )
        except WebPushException as error:
            status = getattr(getattr(error, "response", None), "status_code", None)
            return classify_push_status(status if isinstance(status, int) else 0)
        except Exception:  # a network failure is transient, never fatal for the round
            return PushSendResult(ok=False, status_code=None, reason="transient")
        return classify_push_status(201)


def create_push_transport(
    mode: PushMode,
    *,
    clock: Clock,
    ci: str | None = None,
    subject: str | None = None,
    public_key: str | None = None,
    private_key: str | None = None,
) -> PushTransport:
    """EF-6, CL-8 - builds the transport of the configuration, refusing `live` in CI."""
    if mode == "mock":
        return MockPushTransport(clock.now)
    if ci is not None and ci not in ("", "false", "0"):
        raise AppError("SERVICE_UNAVAILABLE", fr.PUSH_LIVE_REFUSED_CI)
    if not subject or not public_key or not private_key:
        raise AppError("SERVICE_UNAVAILABLE", fr.PUSH_NOT_CONFIGURED)
    return WebPushTransport(subject, public_key, private_key)


__all__ = [
    "BODY_MAX",
    "GONE_STATUSES",
    "MOCK_PUSH_HOST",
    "MOCK_PUSH_OUTCOMES",
    "MOCK_STATUS",
    "PUSH_ERROR_CODES",
    "PUSH_MAX_FAILURES",
    "PUSH_PAYLOAD_MAX_BYTES",
    "PUSH_REQUEST_TIMEOUT_SECONDS",
    "PUSH_TTL_SECONDS",
    "TITLE_MAX",
    "AttemptDecision",
    "MockPushRecord",
    "MockPushTransport",
    "PushMode",
    "PushPayload",
    "PushSendResult",
    "PushTarget",
    "PushTransport",
    "RoundSummary",
    "WebPushTransport",
    "build_push_payload",
    "classify_push_status",
    "create_push_transport",
    "decide_attempt",
    "mock_outcome_of",
    "mock_push_endpoint",
    "safe_notification_url",
    "summarize_round",
]
