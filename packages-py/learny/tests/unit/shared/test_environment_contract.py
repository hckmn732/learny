"""[SPEC-009] Environment contract of the Python backend (ADR-2042).

Only `ENVIRONMENT_VARIABLES` are read from the process environment; the modes are derived from
`APP_ENV` (and `CLOCK_FIXED_AT`), the other former variables are constants of the code.
"""

import base64

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from learny.shared.config import (
    ENVIRONMENT_VARIABLES,
    Settings,
    derive_rate_limit_secret,
    vapid_public_key_of,
    vapid_subject_of,
)

pytestmark = pytest.mark.spec("SPEC-009")

RETIRED = (
    "LLM_MODE",
    "STRIPE_MODE",
    "EMAIL_MODE",
    "PUSH_MODE",
    "JOBS_MODE",
    "RATE_LIMIT_MODE",
    "RATE_LIMIT_IP_SECRET",
    "TRUST_PROXY",
    "ALLOWED_ORIGINS",
    "DATABASE_POOL_MAX",
    "SMTP_PORT",
    "VAPID_SUBJECT",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "LEGAL_CGU_VERSION",
    "LEGAL_PRIVACY_VERSION",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_JWKS_URL",
    "SENTRY_DSN",
    "PY_HONO_UPSTREAM_URL",
    "OWNERSHIP_OVERRIDES",
)


@pytest.fixture(autouse=True)
def _clean_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (*ENVIRONMENT_VARIABLES, *RETIRED):
        monkeypatch.delenv(name, raising=False)


def test_retired_variables_are_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    assert not set(RETIRED) & set(ENVIRONMENT_VARIABLES)
    monkeypatch.setenv("APP_ENV", "local")
    for name, value in {
        "LLM_MODE": "live",
        "STRIPE_MODE": "live",
        "EMAIL_MODE": "resend",
        "PUSH_MODE": "live",
        "JOBS_MODE": "inline",
        "RATE_LIMIT_MODE": "off",
        "TRUST_PROXY": "true",
        "DATABASE_POOL_MAX": "42",
        "SUPABASE_URL": "http://ignored.example",
    }.items():
        monkeypatch.setenv(name, value)

    settings = Settings()

    assert (settings.llm_mode, settings.stripe_mode, settings.email_mode) == ("mock", "mock", "smtp")
    assert (settings.push_mode, settings.jobs_mode, settings.rate_limit_mode) == ("mock", "worker", "on")
    assert settings.trust_proxy is False
    assert settings.database_pool_max == 5
    assert settings.supabase_url == "http://127.0.0.1:54321"


@pytest.mark.parametrize(
    ("app_env", "expected"),
    [
        ("local", ("mock", "mock", "smtp", "mock")),
        ("test", ("mock", "mock", "memory", "mock")),
        ("preview", ("live", "mock", "resend", "live")),
        ("production", ("live", "mock", "resend", "live")),
    ],
)
def test_the_modes_are_derived_from_app_env(
    monkeypatch: pytest.MonkeyPatch, app_env: str, expected: tuple[str, str, str, str]
) -> None:
    monkeypatch.setenv("APP_ENV", app_env)

    settings = Settings()

    assert (settings.llm_mode, settings.stripe_mode, settings.email_mode, settings.push_mode) == expected
    assert (settings.jobs_mode, settings.rate_limit_mode) == ("worker", "on")


def test_the_frozen_clock_stacks_switch_the_limiter_off_and_run_jobs_inline_in_test(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CLOCK_FIXED_AT", "2026-11-11T12:20:00Z")

    monkeypatch.setenv("APP_ENV", "test")
    end_to_end = Settings()
    monkeypatch.setenv("APP_ENV", "local")
    qa = Settings()

    assert (end_to_end.jobs_mode, end_to_end.rate_limit_mode) == ("inline", "off")
    assert (qa.jobs_mode, qa.rate_limit_mode) == ("worker", "off")


@pytest.mark.parametrize(
    ("key", "mode"),
    [(None, "mock"), ("sk_test_only", "test"), ("sk_live_only", "live"), ("rk_live_only", "live")],
)
def test_the_stripe_mode_follows_the_secret_key(key: str | None, mode: str) -> None:
    assert Settings(app_env="production", stripe_secret_key=key).stripe_mode == mode


def test_smtp_host_selects_the_smtp_transport_outside_test() -> None:
    assert Settings(app_env="preview", smtp_host="mailpit").email_mode == "smtp"
    assert Settings(app_env="production", smtp_host=" ").email_mode == "resend"
    assert Settings(app_env="test", smtp_host="mailpit").email_mode == "memory"


def test_the_real_clock_keyword_is_not_a_frozen_instant(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "local")
    monkeypatch.setenv("CLOCK_FIXED_AT", "real")

    settings = Settings()

    assert settings.fixed_instant is None
    assert settings.rate_limit_mode == "on"


def test_explicit_values_still_win_over_the_derivation() -> None:
    settings = Settings(app_env="production", llm_mode="mock", rate_limit_mode="off")

    assert (settings.llm_mode, settings.rate_limit_mode) == ("mock", "off")


def test_the_supabase_names_are_the_public_ones(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-only")

    settings = Settings()

    assert settings.supabase_url == "https://project.supabase.co"
    assert settings.supabase_anon_key == "anon-test-only"
    assert settings.supabase_jwt_issuer == "https://project.supabase.co/auth/v1"
    assert settings.supabase_jwks == "https://project.supabase.co/auth/v1/.well-known/jwks.json"


def test_the_rate_limit_key_is_derived_from_the_master_key(monkeypatch: pytest.MonkeyPatch) -> None:
    master = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
    monkeypatch.setenv("APP_ENCRYPTION_KEY", master)

    settings = Settings()

    assert settings.rate_limit_ip_secret == derive_rate_limit_secret(master)
    assert settings.rate_limit_ip_secret is not None
    assert len(settings.rate_limit_ip_secret) >= 32
    assert master not in settings.rate_limit_ip_secret
    assert derive_rate_limit_secret(master) != derive_rate_limit_secret(master[::-1])
    assert Settings(app_encryption_key=None).rate_limit_ip_secret is None


def test_the_vapid_public_key_and_subject_are_derived(monkeypatch: pytest.MonkeyPatch) -> None:
    private = ec.generate_private_key(ec.SECP256R1())
    scalar = private.private_numbers().private_value.to_bytes(32, "big")
    private_b64 = base64.urlsafe_b64encode(scalar).rstrip(b"=").decode()
    point = private.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    expected_public = base64.urlsafe_b64encode(point).rstrip(b"=").decode()
    monkeypatch.setenv("VAPID_PRIVATE_KEY", private_b64)
    monkeypatch.setenv("EMAIL_FROM", "Learny <bonjour@learny.example>")

    settings = Settings()

    assert vapid_public_key_of(private_b64) == expected_public
    assert settings.vapid_public_key == expected_public
    assert settings.vapid_subject == "mailto:bonjour@learny.example"
    assert vapid_subject_of("qa@learny.test") == "mailto:qa@learny.test"
    assert vapid_public_key_of("not a key") is None
