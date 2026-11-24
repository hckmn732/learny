"""APNs channel of the native push (SPEC-3501 ET-2, ADR-3007).

Apple Push Notification service: HTTP/2 to `api.push.apple.com` (or the sandbox host), one POST per
device token, authenticated by a *provider token* — a JWT signed ES256 with the `.p8` key, carrying
the key identifier (`kid`) and the team identifier (`iss`). Apple refuses a provider token older
than one hour and asks for a renewal every 50 minutes; the provider caches it for that long and a
test drives the injected clock to observe the renewal.

The notification carries the title, the text and the internal destination of the Web Push, and no
badge: BR-NOT-02 and EF-7 of V1 (`aps.sound` is the default sound, nothing else).

The answer decides the fate of the subscription exactly like the browser channel (ADR-0055): `410`
or an `Unregistered`/`BadDeviceToken` reason deletes the row at once, any other failure is transient
and the fifth consecutive one deletes it.
"""

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

import jwt

from learny.engagement.infrastructure.push import (
    PUSH_TTL_SECONDS,
    PushSendResult,
    PushTarget,
    classify_push_status,
)
from learny.engagement.infrastructure.push_http import PostJson, post_json

APNS_JWT_LIFETIME_SECONDS = 50 * 60
APNS_DEFAULT_ENVIRONMENT = "production"
APNS_HOSTS: dict[str, str] = {
    "production": "https://api.push.apple.com",
    "sandbox": "https://api.sandbox.push.apple.com",
}
# Reasons Apple returns inside a 400 (or with the status of the row): the token is dead for good.
APNS_GONE_REASONS = frozenset(
    {
        "BadDeviceToken",
        "DeviceTokenNotForTopic",
        "Unregistered",
        "ExpiredProviderToken",
        "InvalidProviderToken",
    }
)
APNS_GONE_STATUSES = frozenset({404, 410})


@dataclass(frozen=True, slots=True)
class ApnsConfig:
    """The five values of the provider token, read from the typed configuration (ET-1)."""

    key_id: str
    team_id: str
    private_key: str
    topic: str
    environment: str = APNS_DEFAULT_ENVIRONMENT

    @property
    def host(self) -> str:
        return APNS_HOSTS.get(self.environment, APNS_HOSTS[APNS_DEFAULT_ENVIRONMENT])


class ApnsJwt:
    """Provider token of the channel, renewed every 50 minutes and never logged (ET-4)."""

    def __init__(self, config: ApnsConfig, now: Callable[[], float]) -> None:
        self._config = config
        self._now = now
        self._token: str | None = None
        self._issued_at = 0.0

    def authorization(self) -> str:
        """`bearer <jwt>`, signing a new token once the cached one is 50 minutes old."""
        now = self._now()
        if self._token is None or now - self._issued_at >= APNS_JWT_LIFETIME_SECONDS:
            self._token = self._sign(int(now))
            self._issued_at = now
        return f"bearer {self._token}"

    def _sign(self, issued_at: int) -> str:
        claims = {"iss": self._config.team_id, "iat": issued_at}
        return jwt.encode(
            claims,
            self._config.private_key,
            algorithm="ES256",
            headers={"kid": self._config.key_id},
        )


def apns_payload(payload: str) -> bytes:
    """The APNs document: the same four fields as the Web Push, no badge (EF-7, ET-3)."""
    data: Mapping[str, Any] = json.loads(payload)
    document = {
        "aps": {
            "alert": {"title": data.get("title", ""), "body": data.get("body", "")},
            "sound": "default",
        },
        "url": data.get("url", "/"),
        "tag": data.get("tag", ""),
        "icon": data.get("icon", ""),
    }
    return json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def classify_apns(status_code: int, answer: Any) -> PushSendResult:
    """2xx sent; 404/410 or a dead-token reason is definitive; anything else is transient."""
    reason = answer.get("reason") if isinstance(answer, Mapping) else None
    if status_code in APNS_GONE_STATUSES:
        return PushSendResult(ok=False, status_code=status_code, reason="gone")
    if isinstance(reason, str) and reason in APNS_GONE_REASONS:
        # An expired provider token is a configuration problem, not a dead device: Apple answers it
        # with 403 and the next attempt resigns; it never deletes the subscription.
        if reason in ("ExpiredProviderToken", "InvalidProviderToken"):
            return PushSendResult(ok=False, status_code=status_code, reason="transient")
        return PushSendResult(ok=False, status_code=status_code, reason="gone")
    return classify_push_status(status_code)


class ApnsTransport:
    """`live` APNs transport: one HTTP/2 POST per token, provider token cached (ET-2)."""

    kind = "apns"

    def __init__(
        self,
        config: ApnsConfig,
        *,
        now: Callable[[], float],
        post: PostJson = post_json,
    ) -> None:
        self._config = config
        self._now = now
        self._jwt = ApnsJwt(config, now)
        self._post = post

    @property
    def mode(self) -> str:
        return "live"

    async def send(self, target: PushTarget, payload: str, *, ttl: int, topic: str | None) -> PushSendResult:
        if not isinstance(target.token, str) or target.token == "":
            return PushSendResult(ok=False, status_code=None, reason="gone")
        headers = {
            "authorization": self._jwt.authorization(),
            "apns-topic": self._config.topic,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-expiration": str(int(self._now() + min(ttl, PUSH_TTL_SECONDS))),
            "content-type": "application/json",
        }
        url = f"{self._config.host}/3/device/{target.token}"
        try:
            status_code, answer = await self._post(url, apns_payload(payload), headers)
        except Exception:  # a network failure is transient, never fatal for the round
            return PushSendResult(ok=False, status_code=None, reason="transient")
        return classify_apns(status_code, answer)


def build_apns_transport(
    config: ApnsConfig | None, *, now: Callable[[], float], post: PostJson = post_json
) -> ApnsTransport | None:
    """The channel of the configuration, or `None` when the five APNs values are absent."""
    if config is None or not (config.key_id and config.team_id and config.private_key and config.topic):
        return None
    return ApnsTransport(config, now=now, post=post)


__all__ = [
    "APNS_DEFAULT_ENVIRONMENT",
    "APNS_GONE_REASONS",
    "APNS_HOSTS",
    "APNS_JWT_LIFETIME_SECONDS",
    "ApnsConfig",
    "ApnsJwt",
    "ApnsTransport",
    "apns_payload",
    "build_apns_transport",
    "classify_apns",
]
