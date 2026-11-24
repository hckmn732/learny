"""[SPEC-009] Public client configuration (`config.public`, ADR-4007)."""

import pytest
from learny.shared.config import Settings
from learny_api.handlers.public_config import public_config

pytestmark = pytest.mark.spec("SPEC-009")

MASTER_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="


def test_the_public_configuration_exposes_the_five_public_values() -> None:
    settings = Settings(
        app_env="test",
        supabase_url="https://project.supabase.co",
        supabase_anon_key="anon-test-only",
        next_public_app_url="https://learny.example",
        app_encryption_key=MASTER_KEY,
        stripe_publishable_key="pk_test_only",
    )

    config = public_config(settings)

    assert config == {
        "supabaseUrl": "https://project.supabase.co",
        "supabaseAnonKey": "anon-test-only",
        "webUrl": "https://learny.example",
        "vapidPublicKey": settings.vapid_public_key,
        "stripePublishableKey": "pk_test_only",
    }
    assert config["vapidPublicKey"] is not None
    assert MASTER_KEY not in str(config)


def test_unset_values_are_null() -> None:
    settings = Settings(app_env="test", supabase_anon_key="", app_encryption_key=None)

    config = public_config(settings)

    assert config["supabaseAnonKey"] is None
    assert config["vapidPublicKey"] is None
    assert config["stripePublishableKey"] is None
