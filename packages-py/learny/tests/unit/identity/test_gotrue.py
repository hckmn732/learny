"""[SPEC-2101] GoTrue error translation and client endpoints (SPEC-202 ET-2)."""

import json

import httpx
import pytest
from learny.identity.infrastructure.gotrue import (
    DEFAULT_RESEND_SECONDS,
    GoTrueClient,
    GoTrueError,
    map_gotrue_error,
    parse_user,
    retry_after_from_message,
)
from learny.shared.config import Settings
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-2101")

BASE = "http://127.0.0.1:54321"
ANON = "anon-key"
SERVICE = "service-role-key"


def settings() -> Settings:
    return Settings(
        app_env="test",
        supabase_url=BASE,
        supabase_anon_key=ANON,
        supabase_service_role_key=SERVICE,
        supabase_jwt_secret="x" * 40,
    )


def client(handler: object) -> GoTrueClient:
    transport = httpx.MockTransport(handler)  # type: ignore[arg-type]
    return GoTrueClient(settings(), client=httpx.AsyncClient(transport=transport))


def error(code: str, message: str = "", status: int = 400) -> GoTrueError:
    return GoTrueError(status, code, message)


def translate(code: str, message: str = "", status: int = 400, **context: bool) -> AppError | None:
    return map_gotrue_error(error(code, message, status), **context)


def test_invalid_credentials() -> None:
    translated = translate("invalid_credentials")
    assert translated is not None
    assert translated.code == "INVALID_CREDENTIALS"
    assert translated.detail == "Adresse e-mail ou mot de passe incorrect."


def test_email_not_confirmed() -> None:
    translated = translate("email_not_confirmed")
    assert translated is not None
    assert translated.code == "EMAIL_NOT_CONFIRMED"


def test_resend_too_soon_from_the_code() -> None:
    translated = translate("over_email_send_rate_limit")
    assert translated is not None
    assert translated.code == "RESEND_TOO_SOON"
    assert translated.retry_after == DEFAULT_RESEND_SECONDS


def test_resend_too_soon_reads_the_delay_from_the_message() -> None:
    translated = translate("unknown", "you can only request this after 37 seconds")
    assert translated is not None
    assert translated.code == "RESEND_TOO_SOON"
    assert translated.retry_after == 37
    assert "37 secondes" in (translated.detail or "")


@pytest.mark.parametrize(
    "message",
    ["after 0 seconds", "after 500 seconds", "no delay here"],
)
def test_retry_after_is_bounded(message: str) -> None:
    seconds = retry_after_from_message(message)
    assert 1 <= seconds <= DEFAULT_RESEND_SECONDS


@pytest.mark.parametrize("code", ["otp_disabled", "signup_disabled"])
def test_an_unknown_address_stays_silent(code: str) -> None:
    assert translate(code, silent_when_unknown_user=True) is None


def test_signups_not_allowed_stays_silent() -> None:
    assert (
        translate("unknown", "Signups not allowed for this instance", silent_when_unknown_user=True) is None
    )


@pytest.mark.parametrize("code", ["user_already_exists", "email_exists"])
def test_an_existing_account_stays_silent_on_sign_up(code: str) -> None:
    assert translate(code, silent_when_already_registered=True) is None


def test_an_existing_account_is_an_error_on_sign_in() -> None:
    translated = translate("user_already_exists")
    assert translated is not None
    assert translated.code == "SERVICE_UNAVAILABLE"


def test_weak_password_becomes_a_validation_error() -> None:
    translated = translate("weak_password")
    assert translated is not None
    assert translated.code == "VALIDATION_FAILED"
    assert translated.extra["errors"] == [
        {"path": "body.password", "message": "Choisissez un mot de passe plus long."}
    ]


def test_too_many_attempts_is_rate_limited() -> None:
    translated = translate("over_request_rate_limit")
    assert translated is not None
    assert translated.code == "RATE_LIMITED"
    assert translated.retry_after == DEFAULT_RESEND_SECONDS
    assert translate("unknown", status=429) is not None


def test_everything_else_is_unavailable() -> None:
    translated = translate("unexpected_failure")
    assert translated is not None
    assert translated.code == "SERVICE_UNAVAILABLE"


def test_parse_user_reads_the_confirmation() -> None:
    confirmed = parse_user({"id": "u-1", "email": "a@test", "email_confirmed_at": "2026-11-11T12:20:00Z"})
    assert confirmed.id == "u-1"
    assert confirmed.email == "a@test"
    assert confirmed.email_confirmed is True
    pending = parse_user({"id": "u-1", "email": None, "email_confirmed_at": None})
    assert pending.email is None
    assert pending.email_confirmed is False
    with pytest.raises(GoTrueError, match="invalid_response"):
        parse_user({"email": "a@test"})


async def test_password_grant_reads_the_session() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json={
                "access_token": "access",
                "refresh_token": "refresh",
                "user": {"id": "u-1", "email": "a@test", "email_confirmed_at": "2026-11-11T12:20:00Z"},
            },
        )

    session = await client(handler).sign_in_with_password("a@test", "password")
    assert session.access_token == "access"
    assert session.refresh_token == "refresh"
    assert session.user.id == "u-1"
    request = seen[0]
    assert request.url.path == "/auth/v1/token"
    assert request.url.params["grant_type"] == "password"
    assert request.headers["apikey"] == ANON
    assert json.loads(request.content) == {"email": "a@test", "password": "password"}


async def test_an_error_response_carries_the_code() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error_code": "invalid_credentials", "msg": "Invalid login"})

    with pytest.raises(GoTrueError) as caught:
        await client(handler).sign_in_with_password("a@test", "wrong")
    assert caught.value.code == "invalid_credentials"
    assert caught.value.status == 400


async def test_get_user_returns_none_for_a_refused_token() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "invalid JWT"})

    assert await client(handler).get_user("stale") is None


async def test_get_user_reads_the_account() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/auth/v1/user"
        assert request.headers["authorization"] == "Bearer access"
        return httpx.Response(200, json={"id": "u-1", "email": "a@test", "email_confirmed_at": "x"})

    user = await client(handler).get_user("access")
    assert user is not None
    assert user.id == "u-1"


async def test_an_admin_call_uses_the_service_role() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": "u-2", "email": "b@test", "email_confirmed_at": "x"})

    user = await client(handler).admin_create_user("b@test", "password")
    assert user.id == "u-2"
    assert seen[0].headers["apikey"] == SERVICE
    assert seen[0].headers["authorization"] == f"Bearer {SERVICE}"
    assert json.loads(seen[0].content)["email_confirm"] is True


async def test_a_network_failure_is_a_gotrue_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    with pytest.raises(GoTrueError) as caught:
        await client(handler).sign_out("access")
    assert caught.value.code == "network_error"
