"""FCM channel of the native push (SPEC-3501 ET-2, ADR-3007).

Firebase Cloud Messaging HTTP v1: one POST to `projects/<id>/messages:send`, authenticated by an
OAuth 2.0 access token minted from the service account (`google-auth`, in the accepted dependencies
of ADR-2015). The token lives about an hour; it is cached in memory until its expiry and renewed on
the next send, so a round of a hundred devices signs in once.

The message carries the title and the text of the Web Push in the system notification, the internal
destination and the icon in the data payload, and the high-importance Android channel « Rappels
Learny » (`learny-reminders`) declared by `app.config.ts` (EF-7). No badge, no sound override other
than the channel default.

The answer decides the fate of the subscription exactly like the browser channel (ADR-0055):
`UNREGISTERED` (or a `NOT_FOUND`) deletes the row at once, anything else is transient and the fifth
consecutive failure deletes it.
"""

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol

from learny.engagement.infrastructure.push import (
    PUSH_TTL_SECONDS,
    PushSendResult,
    PushTarget,
    classify_push_status,
)
from learny.engagement.infrastructure.push_http import PostJson, post_json

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
FCM_URL = "https://fcm.googleapis.com/v1/projects/{project}/messages:send"
FCM_ANDROID_CHANNEL_ID = "learny-reminders"
FCM_UNREGISTERED = "UNREGISTERED"
FCM_GONE_STATUSES = frozenset({404})


@dataclass(frozen=True, slots=True)
class FcmConfig:
    """The two values of the service account, read from the typed configuration (ET-1)."""

    project_id: str
    service_account_json: str

    def account_info(self) -> Mapping[str, Any]:
        """The decoded service account; an unreadable document is a configuration error."""
        document: Any = json.loads(self.service_account_json)
        if not isinstance(document, dict):
            raise ValueError("FCM service account is not a JSON object")
        return document

    @property
    def url(self) -> str:
        return FCM_URL.format(project=self.project_id)


class AccessTokenSource(Protocol):
    """Where the OAuth access token comes from; a test hands over a counter instead of Google."""

    def token(self, now: float) -> tuple[str, float]:
        """`(access token, expiry as a Unix time)`."""


class GoogleServiceAccountTokens:
    """`google-auth` adapter: one refresh when the cached credentials are expired (ET-2)."""

    def __init__(self, info: Mapping[str, Any]) -> None:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account

        self._request = Request()
        self._credentials = service_account.Credentials.from_service_account_info(
            dict(info), scopes=[FCM_SCOPE]
        )

    def token(self, now: float) -> tuple[str, float]:
        if not self._credentials.valid:
            self._credentials.refresh(self._request)
        expiry = self._credentials.expiry.timestamp() if self._credentials.expiry else now
        return str(self._credentials.token or ""), expiry


class FcmOAuth:
    """Access token cache: one OAuth exchange per hour, renewed one minute before expiry."""

    def __init__(self, source: AccessTokenSource) -> None:
        self._source = source
        self._token: str | None = None
        self._expires_at = 0.0

    def authorization(self, now: float) -> str:
        if self._token is None or self._expires_at - 60.0 <= now:
            token, expires_at = self._source.token(now)
            if token != "":
                self._token = token
                self._expires_at = expires_at
        return f"Bearer {self._token or ''}"


def fcm_message(token: str, payload: str, *, ttl: int) -> bytes:
    """The HTTP v1 message: system notification, internal destination, high-priority channel."""
    data: Mapping[str, Any] = json.loads(payload)
    document = {
        "message": {
            "token": token,
            "notification": {"title": data.get("title", ""), "body": data.get("body", "")},
            "data": {
                "url": str(data.get("url", "/")),
                "tag": str(data.get("tag", "")),
                "icon": str(data.get("icon", "")),
            },
            "android": {
                "priority": "high",
                "ttl": f"{min(ttl, PUSH_TTL_SECONDS)}s",
                "notification": {
                    "channel_id": FCM_ANDROID_CHANNEL_ID,
                    "default_sound": True,
                    "default_vibrate_timings": True,
                },
            },
        }
    }
    return json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def classify_fcm(status_code: int, answer: Any) -> PushSendResult:
    """2xx sent; `UNREGISTERED` or 404 is definitive; anything else is transient."""
    if 200 <= status_code < 300:
        return PushSendResult(ok=True, status_code=status_code)
    if status_code in FCM_GONE_STATUSES:
        return PushSendResult(ok=False, status_code=status_code, reason="gone")
    if isinstance(answer, Mapping):
        error = answer.get("error")
        if isinstance(error, Mapping):
            if error.get("status") == "NOT_FOUND":
                return PushSendResult(ok=False, status_code=status_code, reason="gone")
            if _has_unregistered_detail(error):
                return PushSendResult(ok=False, status_code=status_code, reason="gone")
    return classify_push_status(status_code)


def _has_unregistered_detail(error: Mapping[str, Any]) -> bool:
    details = error.get("details")
    if not isinstance(details, list):
        return False
    for detail in details:
        if isinstance(detail, Mapping) and detail.get("errorCode") == FCM_UNREGISTERED:
            return True
    return False


class FcmTransport:
    """`live` FCM transport: one POST per token, OAuth token cached (ET-2)."""

    kind = "fcm"

    def __init__(
        self,
        config: FcmConfig,
        *,
        tokens: AccessTokenSource | None = None,
        now: Callable[[], float],
        post: PostJson = post_json,
    ) -> None:
        self._config = config
        self._now = now
        self._oauth = FcmOAuth(
            tokens if tokens is not None else GoogleServiceAccountTokens(config.account_info())
        )
        self._post = post

    @property
    def mode(self) -> str:
        return "live"

    async def send(self, target: PushTarget, payload: str, *, ttl: int, topic: str | None) -> PushSendResult:
        if not isinstance(target.token, str) or target.token == "":
            return PushSendResult(ok=False, status_code=None, reason="gone")
        headers = {
            "authorization": self._oauth.authorization(self._now()),
            "content-type": "application/json",
        }
        try:
            status_code, answer = await self._post(
                self._config.url, fcm_message(target.token, payload, ttl=ttl), headers
            )
        except Exception:  # a network failure is transient, never fatal for the round
            return PushSendResult(ok=False, status_code=None, reason="transient")
        return classify_fcm(status_code, answer)


def build_fcm_transport(
    config: FcmConfig | None, *, now: Callable[[], float], post: PostJson = post_json
) -> FcmTransport | None:
    """The channel of the configuration, or `None` when the project or the account is absent."""
    if config is None or not config.project_id or not config.service_account_json:
        return None
    try:
        config.account_info()
    except ValueError:
        return None
    return FcmTransport(config, now=now, post=post)


__all__ = [
    "FCM_ANDROID_CHANNEL_ID",
    "FCM_GONE_STATUSES",
    "FCM_SCOPE",
    "FCM_UNREGISTERED",
    "FCM_URL",
    "AccessTokenSource",
    "FcmConfig",
    "FcmOAuth",
    "FcmTransport",
    "GoogleServiceAccountTokens",
    "build_fcm_transport",
    "classify_fcm",
    "fcm_message",
]
