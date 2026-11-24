"""Browser push channel of the engagement context (SPEC-2205).

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

from learny.engagement.domain.push_token import (
    NATIVE_KINDS,
    is_native_kind,
    mask_endpoint,
    mask_token,
)
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
    """One subscription, as the transport of its channel needs it (ADR-3007).

    `webpush` carries the endpoint and the two client keys; `apns` and `fcm` carry the device token.
    The defaults keep every historical call of the browser channel valid.
    """

    kind: str = "webpush"
    endpoint: str | None = None
    p256dh: str | None = None
    auth: str | None = None
    token: str | None = None


@dataclass(frozen=True, slots=True)
class PushSendResult:
    """One answer of a channel; `gone` is definitive, `transient` may be retried.

    `detail` carries a code for the journal only (`channel_not_configured`), never a provider body:
    a token or a device name never reaches a log line (ET-4).
    """

    ok: bool
    status_code: int | None
    reason: PushFailureReason | None = None
    detail: str | None = None


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
    """One simulated call, kept in memory for the tests and the demonstration (EF-6).

    The three channels write into the same box: `kind` tells them apart and the token is already
    masked (ET-4), so the demonstration can be inspected without ever exposing a credential.
    """

    at: str
    host: str
    outcome: str
    status_code: int
    ttl: int
    topic: str | None
    payload_bytes: int
    payload: str
    kind: str = "webpush"
    target: str = ""


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


def mock_native_outcome_of(token: str) -> str:
    """EF-6 — the outcome a mock native send simulates, read from the token itself.

    A token that spells an outcome (`…-gone-…`) simulates it; anything else succeeds. The rule keeps
    the simulated channels deterministic without any network access, exactly like the endpoint rule
    of the browser channel.
    """
    for outcome in ("gone", "transient"):
        if outcome in token.lower():
            return outcome
    return "success"


def mock_native_token(scope: str, outcome: MockPushOutcome = "success") -> str:
    """A well-formed token of the mock channel, distinct per `scope` (tests, demonstrations)."""
    marker = "" if outcome == "success" else f"-{outcome}-"
    return f"mock{marker}-{scope}-token-0123456789abcdef"


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
        native = is_native_kind(target.kind)
        if native:
            outcome = mock_native_outcome_of(target.token or "")
            host = target.kind
            target_label = mask_token(target.token)
        else:
            outcome = mock_outcome_of(target.endpoint or "")
            host = urlparse(target.endpoint or "").hostname or ""
            target_label = mask_endpoint(target.endpoint)
        status_code = MOCK_STATUS[outcome]
        self._outbox.append(
            MockPushRecord(
                at=self._now().isoformat(),
                host=host,
                outcome=outcome,
                status_code=status_code,
                ttl=ttl,
                topic=topic,
                payload_bytes=len(encoded),
                payload=payload,
                kind=target.kind,
                target=target_label,
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

        if target.endpoint is None or target.p256dh is None or target.auth is None:
            return PushSendResult(ok=False, status_code=None, reason="gone")
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


class PushChannelRouter:
    """Routes one round to the channel each subscription belongs to (EF-5, ADR-3007 §3).

    The unified notification service keeps its single entry point: it asks the router for one send
    per subscription and receives the same `PushSendResult` whatever the channel. Preferences,
    quiet hours, the daily cap and the journal are decided upstream and never depend on the channel.
    A channel the configuration does not provide is reported as `channel_not_configured` — a
    transient failure that costs one of the five attempts, never a silent success (ET-4).
    """

    def __init__(self, channels: Mapping[str, PushTransport], *, mode: str) -> None:
        self._channels = dict(channels)
        self._mode = mode

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def kinds(self) -> tuple[str, ...]:
        return tuple(sorted(self._channels))

    def channel(self, kind: str) -> PushTransport | None:
        return self._channels.get(kind)

    async def send(self, target: PushTarget, payload: str, *, ttl: int, topic: str | None) -> PushSendResult:
        channel = self._channels.get(target.kind)
        if channel is None:
            return PushSendResult(
                ok=False, status_code=None, reason="transient", detail="channel_not_configured"
            )
        return await channel.send(target, payload, ttl=ttl, topic=topic)


def create_push_channels(
    mode: PushMode,
    *,
    clock: Clock,
    ci: str | None = None,
    subject: str | None = None,
    public_key: str | None = None,
    private_key: str | None = None,
    apns: PushTransport | None = None,
    fcm: PushTransport | None = None,
) -> PushChannelRouter:
    """Builds the three channels of the configuration (EF-6, ET-2).

    In `mock` mode one `MockPushTransport` serves all three kinds: the native sends land in the very
    box the browser one writes to, which is what EF-6 asks for. In `live` mode the browser channel
    keeps its VAPID guard (refused in CI) and the native channels are the adapters built from the
    typed configuration; an absent credential leaves that channel out instead of failing the start.
    """
    if mode == "mock":
        mock = MockPushTransport(clock.now)
        return PushChannelRouter({kind: mock for kind in ("webpush", *NATIVE_KINDS)}, mode="mock")
    web = create_push_transport(
        "live",
        clock=clock,
        ci=ci,
        subject=subject,
        public_key=public_key,
        private_key=private_key,
    )
    channels: dict[str, PushTransport] = {"webpush": web}
    if apns is not None:
        channels["apns"] = apns
    if fcm is not None:
        channels["fcm"] = fcm
    return PushChannelRouter(channels, mode="live")


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
    "PushChannelRouter",
    "PushMode",
    "PushPayload",
    "PushSendResult",
    "PushTarget",
    "PushTransport",
    "RoundSummary",
    "WebPushTransport",
    "build_push_payload",
    "classify_push_status",
    "create_push_channels",
    "create_push_transport",
    "decide_attempt",
    "mock_native_outcome_of",
    "mock_native_token",
    "mock_outcome_of",
    "mock_push_endpoint",
    "safe_notification_url",
    "summarize_round",
]
