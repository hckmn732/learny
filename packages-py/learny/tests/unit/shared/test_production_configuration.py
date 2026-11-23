"""[SPEC-009] Production environment is refused when incomplete (CA-2, ADR-2038)."""

import pytest
from learny.shared.config import (
    PRODUCTION_REQUIRED_ENV,
    ConfigurationError,
    Settings,
    ensure_production_configuration,
    load_settings,
    production_configuration_issues,
)

pytestmark = pytest.mark.spec("SPEC-009")

VALID_ENV = {
    "APP_ENCRYPTION_KEY": "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    "API_PROXY_SECRET": "learny-test-only-api-proxy-secret-value",
    "DATABASE_URL": "postgresql://postgres:postgres@db:5432/postgres",
    "EMAIL_LINK_SECRET": "learny-test-only-email-link-secret-value",
    "NEXT_PUBLIC_APP_URL": "https://learny.example",
    "RATE_LIMIT_IP_SECRET": "learny-test-only-rate-limit-secret-value",
    "RESEND_API_KEY": "re_test_only",
    "STRIPE_PRICE_ID": "price_test_only",
    "STRIPE_SECRET_KEY": "sk_test_only",
    "STRIPE_WEBHOOK_SECRET": "whsec_test_only",
    "SUPABASE_ANON_KEY": "anon-test-only",
    "SUPABASE_SERVICE_ROLE_KEY": "service-test-only",
    "SUPABASE_URL": "https://project.supabase.co",
    "VAPID_PRIVATE_KEY": "private-test-only",
    "VAPID_SUBJECT": "mailto:test@learny.example",
    "VOYAGE_API_KEY": "voyage-test-only",
}


def production_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "production",
        "llm_mode": "live",
        "stripe_mode": "live",
        "email_mode": "resend",
        "push_mode": "live",
        "jobs_mode": "worker",
        "rate_limit_mode": "on",
        "enable_sdd_pages": "false",
        "next_public_app_url": "https://learny.example",
        "supabase_url": "https://project.supabase.co",
    }
    values.update(overrides)
    return Settings.model_validate(values)


def test_a_complete_production_environment_starts() -> None:
    ensure_production_configuration(production_settings(), VALID_ENV)


def test_every_missing_variable_is_named_once_in_a_single_error() -> None:
    with pytest.raises(ConfigurationError) as caught:
        ensure_production_configuration(production_settings(), {})

    assert caught.value.names == tuple(sorted(PRODUCTION_REQUIRED_ENV))
    assert {issue.code for issue in caught.value.issues} == {"missing"}
    assert "Configuration production invalide" in str(caught.value)


@pytest.mark.parametrize("name", PRODUCTION_REQUIRED_ENV)
def test_a_single_missing_variable_refuses_the_start(name: str) -> None:
    truncated = {key: value for key, value in VALID_ENV.items() if key != name}

    with pytest.raises(ConfigurationError) as caught:
        ensure_production_configuration(production_settings(), truncated)

    assert caught.value.names == (name,)


def test_the_error_never_contains_a_secret_value() -> None:
    leaky = dict(VALID_ENV)
    del leaky["STRIPE_PRICE_ID"]
    leaky["APP_ENCRYPTION_KEY"] = "SuperSecretValue"
    leaky["DATABASE_URL"] = "postgresql://learny:SuperSecretValue@db:5432/learny"

    with pytest.raises(ConfigurationError) as caught:
        ensure_production_configuration(production_settings(), leaky)

    rendered = f"{caught.value}\n{caught.value.issues!r}"
    assert "SuperSecretValue" not in rendered


@pytest.mark.parametrize(
    ("overrides", "name", "code"),
    [
        ({"llm_mode": "mock"}, "LLM_MODE", "forbidden"),
        ({"rate_limit_mode": "off"}, "RATE_LIMIT_MODE", "forbidden"),
        ({"stripe_mode": "mock"}, "STRIPE_MODE", "forbidden"),
        ({"email_mode": "memory"}, "EMAIL_MODE", "forbidden"),
        ({"push_mode": "mock"}, "PUSH_MODE", "forbidden"),
        ({"jobs_mode": "inline"}, "JOBS_MODE", "forbidden"),
        ({"enable_sdd_pages": "true"}, "ENABLE_SDD_PAGES", "forbidden"),
        ({"next_public_app_url": "http://learny.example"}, "NEXT_PUBLIC_APP_URL", "incompatible"),
        ({"supabase_url": "http://127.0.0.1:54321"}, "SUPABASE_URL", "incompatible"),
    ],
)
def test_production_refuses_simulated_modes_and_plain_http(
    overrides: dict[str, object], name: str, code: str
) -> None:
    issues = production_configuration_issues(production_settings(**overrides), VALID_ENV)

    assert (name, code) in [(issue.name, issue.code) for issue in issues]


def test_non_production_settings_are_not_checked() -> None:
    ensure_production_configuration(Settings(app_env="test"), {})


def test_load_settings_applies_the_production_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in VALID_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("LLM_MODE", "live")
    monkeypatch.setenv("STRIPE_MODE", "live")
    monkeypatch.setenv("EMAIL_MODE", "resend")
    monkeypatch.setenv("PUSH_MODE", "live")
    monkeypatch.setenv("JOBS_MODE", "worker")

    settings = load_settings()

    assert settings.is_production


def test_load_settings_refuses_an_incomplete_production(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in PRODUCTION_REQUIRED_ENV:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("APP_ENV", "production")

    with pytest.raises(ConfigurationError):
        load_settings()
