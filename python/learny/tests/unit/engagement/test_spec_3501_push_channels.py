"""[SPEC-3501] Native push channels: provider tokens, OAuth cache, payloads and masking.

Every test drives a fake HTTP client: no test ever opens a socket to Apple or Google. The two
credentials are generated here (an ES256 key pair, a service account document) so the suite never
needs a real `.p8` file or a real account, and no secret is committed (ADR-3007, ET-4).
"""

import json
from collections.abc import Mapping
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from learny.engagement.domain.push_token import (
    is_valid_token,
    mask_endpoint,
    mask_token,
    platform_of,
)
from learny.engagement.infrastructure.apns import (
    APNS_JWT_LIFETIME_SECONDS,
    ApnsConfig,
    ApnsJwt,
    ApnsTransport,
    apns_payload,
    classify_apns,
)
from learny.engagement.infrastructure.fcm import (
    FCM_ANDROID_CHANNEL_ID,
    FcmConfig,
    FcmOAuth,
    FcmTransport,
    classify_fcm,
    fcm_message,
)
from learny.engagement.infrastructure.push import (
    MockPushTransport,
    PushChannelRouter,
    PushTarget,
    create_push_channels,
    mock_native_token,
    mock_outcome_of,
)
from learny.shared.clock import FixedClock
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-3501")

FIXED_NOW = 1_760_000_000.0
TOKEN = "fcm-token-0123456789abcdef"
WEB_PAYLOAD = json.dumps(
    {
        "title": "Quiz de validation",
        "body": "40 minutes avant",
        "icon": "clock",
        "url": "/quiz/x",
        "tag": "n-1",
    },
    ensure_ascii=False,
)


def key_pair() -> tuple[str, str]:
    """A fresh ES256 key pair, PEM encoded: `(private, public)`."""
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public = (
        key.public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )
    return private, public


def apns_config(private_key: str) -> ApnsConfig:
    return ApnsConfig(
        key_id="ABC123DEFG",
        team_id="TEAM123456",
        private_key=private_key,
        topic="fr.learny.app",
    )


def fcm_config() -> FcmConfig:
    account = {"type": "service_account", "project_id": "learny-test"}
    return FcmConfig(project_id="learny-test", service_account_json=json.dumps(account))


class FakePost:
    """Records every call of a transport and answers what the test wants."""

    def __init__(self, status: int = 200, answer: Any = None) -> None:
        self.status = status
        self.answer = {} if answer is None else answer
        self.calls: list[tuple[str, bytes, dict[str, str]]] = []

    async def __call__(self, url: str, content: bytes, headers: Mapping[str, str]) -> tuple[int, Any]:
        self.calls.append((url, content, dict(headers)))
        return self.status, self.answer


class FakeTokens:
    """A service-account token source that counts its exchanges (ET-2)."""

    def __init__(self, lifetime: float = 3600.0) -> None:
        self.lifetime = lifetime
        self.calls = 0

    def token(self, now: float) -> tuple[str, float]:
        self.calls += 1
        return f"access-{self.calls}", now + self.lifetime


def body_of(message: bytes) -> Mapping[str, Any]:
    decoded: Any = json.loads(message.decode("utf-8"))
    assert isinstance(decoded, dict)
    return decoded


# --- shapes and masking (ET-1, ET-4) ------------------------------------------------------------


@pytest.mark.parametrize(
    "token",
    ["fcm-token-0123456789abcdef", "a" * 64, "mock-gone-token-0123456789"],
)
def test_a_provider_token_of_the_expected_shape_is_accepted(token: str) -> None:
    assert is_valid_token(token) is True


@pytest.mark.parametrize(
    "token",
    ["", "short", "with space 0123456789", "semi;colon;0123456789", "a" * 513, None, 42],
)
def test_a_malformed_token_is_refused(token: object) -> None:
    assert is_valid_token(token) is False


def test_a_token_is_never_journalled_in_clear() -> None:
    assert mask_token(TOKEN) == "...cdef"
    assert TOKEN not in mask_token(TOKEN)
    assert mask_endpoint("https://push.example.test/send/secret-client-id") == "push.example.test"


def test_the_platform_follows_the_channel() -> None:
    assert platform_of("apns") == "ios"
    assert platform_of("fcm") == "android"
    assert platform_of("apns", "android") == "android"
    assert platform_of("webpush") is None
    assert platform_of("fcm", "windows") == "android"


# --- APNs (ET-2, EF-5) ---------------------------------------------------------------------------


def test_the_provider_token_is_signed_es256_with_its_key_and_team() -> None:
    private, public = key_pair()
    issued: list[float] = [FIXED_NOW]
    provider = ApnsJwt(apns_config(private), now=lambda: issued[0])

    header = provider.authorization()
    assert header.startswith("bearer ")
    claims = jwt.decode(header[len("bearer ") :], public, algorithms=["ES256"], options={"verify_aud": False})
    assert claims["iss"] == "TEAM123456"
    assert claims["iat"] == int(FIXED_NOW)
    key_id = jwt.get_unverified_header(header[len("bearer ") :])["kid"]
    assert key_id == "ABC123DEFG"


def test_the_provider_token_is_renewed_every_fifty_minutes() -> None:
    private, public = key_pair()
    issued: list[float] = [FIXED_NOW]
    provider = ApnsJwt(apns_config(private), now=lambda: issued[0])

    first = provider.authorization()
    issued[0] += APNS_JWT_LIFETIME_SECONDS - 1
    assert provider.authorization() == first

    issued[0] += 2
    renewed = provider.authorization()
    assert renewed != first
    claims = jwt.decode(
        renewed[len("bearer ") :], public, algorithms=["ES256"], options={"verify_aud": False}
    )
    assert claims["iat"] == int(FIXED_NOW + APNS_JWT_LIFETIME_SECONDS + 1)


@pytest.mark.parametrize(
    ("status", "answer", "ok", "reason"),
    [
        (200, {}, True, None),
        (410, {"reason": "Unregistered"}, False, "gone"),
        (400, {"reason": "BadDeviceToken"}, False, "gone"),
        (400, {"reason": "DeviceTokenNotForTopic"}, False, "gone"),
        (403, {"reason": "ExpiredProviderToken"}, False, "transient"),
        (503, {}, False, "transient"),
    ],
)
def test_the_apns_answer_decides_the_fate_of_the_subscription(
    status: int, answer: Mapping[str, Any], ok: bool, reason: str | None
) -> None:
    result = classify_apns(status, answer)
    assert (result.ok, result.reason) == (ok, reason)


def test_the_apns_payload_carries_the_web_push_fields_without_a_badge() -> None:
    document = body_of(apns_payload(WEB_PAYLOAD))
    aps = document["aps"]
    assert aps["alert"] == {"title": "Quiz de validation", "body": "40 minutes avant"}
    assert aps["sound"] == "default"
    assert "badge" not in aps
    assert document["url"] == "/quiz/x"
    assert document["tag"] == "n-1"


async def test_the_apns_transport_posts_the_device_document_over_http2() -> None:
    private, _public = key_pair()
    post = FakePost()
    transport = ApnsTransport(apns_config(private), now=lambda: FIXED_NOW, post=post)

    result = await transport.send(
        PushTarget(kind="apns", token="a" * 64), WEB_PAYLOAD, ttl=3600, topic="topic"
    )

    assert result.ok is True
    url, content, headers = post.calls[0]
    assert url == f"https://api.push.apple.com/3/device/{'a' * 64}"
    assert headers["apns-topic"] == "fr.learny.app"
    assert headers["apns-push-type"] == "alert"
    assert headers["authorization"].startswith("bearer ")
    assert body_of(content)["aps"]["alert"]["title"] == "Quiz de validation"


async def test_the_sandbox_environment_targets_the_development_host() -> None:
    private, _public = key_pair()
    config = ApnsConfig(
        key_id="K", team_id="T", private_key=private, topic="fr.learny.app", environment="sandbox"
    )
    post = FakePost()
    transport = ApnsTransport(config, now=lambda: FIXED_NOW, post=post)

    await transport.send(PushTarget(kind="apns", token="b" * 64), WEB_PAYLOAD, ttl=60, topic=None)

    assert post.calls[0][0].startswith("https://api.sandbox.push.apple.com/3/device/")


async def test_a_network_failure_is_transient_and_never_raises() -> None:
    private, _public = key_pair()

    async def failing(url: str, content: bytes, headers: Mapping[str, str]) -> tuple[int, Any]:
        raise OSError("connection refused")

    transport = ApnsTransport(apns_config(private), now=lambda: FIXED_NOW, post=failing)
    result = await transport.send(PushTarget(kind="apns", token="c" * 64), WEB_PAYLOAD, ttl=60, topic=None)

    assert (result.ok, result.reason) == (False, "transient")


# --- FCM (ET-2, EF-5) ----------------------------------------------------------------------------


def test_the_oauth_token_is_reused_until_its_expiry() -> None:
    source = FakeTokens(lifetime=3600)
    oauth = FcmOAuth(source)

    assert oauth.authorization(FIXED_NOW) == "Bearer access-1"
    assert oauth.authorization(FIXED_NOW + 60) == "Bearer access-1"
    assert source.calls == 1

    assert oauth.authorization(FIXED_NOW + 3600) == "Bearer access-2"
    assert source.calls == 2


@pytest.mark.parametrize(
    ("status", "answer", "ok", "reason"),
    [
        (200, {"name": "projects/x/messages/1"}, True, None),
        (404, {"error": {"status": "NOT_FOUND"}}, False, "gone"),
        (
            400,
            {"error": {"status": "INVALID_ARGUMENT", "details": [{"errorCode": "UNREGISTERED"}]}},
            False,
            "gone",
        ),
        (500, {"error": {"status": "INTERNAL"}}, False, "transient"),
        (429, {}, False, "transient"),
    ],
)
def test_the_fcm_answer_decides_the_fate_of_the_subscription(
    status: int, answer: Mapping[str, Any], ok: bool, reason: str | None
) -> None:
    result = classify_fcm(status, answer)
    assert (result.ok, result.reason) == (ok, reason)


def test_the_fcm_message_targets_the_high_importance_channel_and_the_destination() -> None:
    document = body_of(fcm_message(TOKEN, WEB_PAYLOAD, ttl=3600))
    message = document["message"]
    assert message["token"] == TOKEN
    assert message["notification"] == {"title": "Quiz de validation", "body": "40 minutes avant"}
    assert message["data"] == {"url": "/quiz/x", "tag": "n-1", "icon": "clock"}
    android = message["android"]
    assert android["priority"] == "high"
    assert android["notification"]["channel_id"] == FCM_ANDROID_CHANNEL_ID
    assert android["notification"]["default_sound"] is True


async def test_the_fcm_transport_posts_the_message_with_its_bearer() -> None:
    post = FakePost()
    tokens = FakeTokens()
    transport = FcmTransport(fcm_config(), tokens=tokens, now=lambda: FIXED_NOW, post=post)

    result = await transport.send(PushTarget(kind="fcm", token=TOKEN), WEB_PAYLOAD, ttl=3600, topic=None)

    assert result.ok is True
    url, content, headers = post.calls[0]
    assert url == "https://fcm.googleapis.com/v1/projects/learny-test/messages:send"
    assert headers["authorization"] == "Bearer access-1"
    assert body_of(content)["message"]["token"] == TOKEN


async def test_an_unregistered_fcm_token_is_definitive() -> None:
    post = FakePost(
        status=400,
        answer={"error": {"status": "INVALID_ARGUMENT", "details": [{"errorCode": "UNREGISTERED"}]}},
    )
    transport = FcmTransport(fcm_config(), tokens=FakeTokens(), now=lambda: FIXED_NOW, post=post)

    result = await transport.send(PushTarget(kind="fcm", token=TOKEN), WEB_PAYLOAD, ttl=60, topic=None)

    assert (result.ok, result.reason) == (False, "gone")


# --- router and demonstration box (EF-5, EF-6, ET-4) ---------------------------------------------


def test_the_mock_mode_serves_the_three_channels_from_one_box() -> None:
    clock = FixedClock(parse_iso("2026-11-11T12:20:00Z"))
    router = create_push_channels("mock", clock=clock)

    assert router.mode == "mock"
    assert router.kinds == ("apns", "fcm", "webpush")
    assert router.channel("apns") is router.channel("fcm") is router.channel("webpush")


async def test_a_mock_native_send_lands_in_the_demo_box_with_a_masked_token() -> None:
    clock = FixedClock(parse_iso("2026-11-11T12:20:00Z"))
    router = create_push_channels("mock", clock=clock)

    result = await router.send(PushTarget(kind="fcm", token=TOKEN), WEB_PAYLOAD, ttl=3600, topic="topic")

    assert result.ok is True
    channel = router.channel("fcm")
    assert isinstance(channel, MockPushTransport)
    record = channel.records()[-1]
    assert record.kind == "fcm"
    assert record.target == mask_token(TOKEN)
    assert TOKEN not in record.target
    assert record.payload == WEB_PAYLOAD


@pytest.mark.parametrize(
    ("token", "outcome"),
    [
        (mock_native_token("ok"), "success"),
        (mock_native_token("dead", "gone"), "gone"),
        (mock_native_token("down", "transient"), "transient"),
    ],
)
async def test_the_mock_native_outcome_is_deterministic(token: str, outcome: str) -> None:
    clock = FixedClock(parse_iso("2026-11-11T12:20:00Z"))
    transport = MockPushTransport(clock.now)

    result = await transport.send(PushTarget(kind="apns", token=token), WEB_PAYLOAD, ttl=60, topic=None)

    assert result.ok is (outcome == "success")
    if outcome != "success":
        assert result.reason == outcome


def test_the_browser_endpoint_still_selects_its_outcome() -> None:
    assert mock_outcome_of("https://push.mock.learny.test/x/gone") == "gone"
    assert mock_outcome_of("https://push.mock.learny.test/x/anything") == "success"


async def test_an_unconfigured_channel_is_transient_and_named_in_the_journal() -> None:
    clock = FixedClock(parse_iso("2026-11-11T12:20:00Z"))
    mock = MockPushTransport(clock.now)
    router = PushChannelRouter({"webpush": mock}, mode="live")

    result = await router.send(PushTarget(kind="fcm", token=TOKEN), WEB_PAYLOAD, ttl=60, topic=None)

    assert (result.ok, result.reason, result.detail) == (False, "transient", "channel_not_configured")
    assert mock.records() == ()
