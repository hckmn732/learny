"""[SPEC-2206] Billing configuration (ported from `billing/config.test.ts`, SPEC-210).

The default mode follows `APP_ENV`, `STRIPE_MODE=mock` is refused in production (ADR-0215) and the
public address is normalised while empty values are ignored.
"""

import pytest
from learny.billing.domain.config import resolve_billing_config
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-2206")


def test_the_default_mode_follows_app_env() -> None:
    assert resolve_billing_config({"APP_ENV": "local"}).mode == "mock"
    assert resolve_billing_config({"APP_ENV": "test"}).mode == "mock"
    assert resolve_billing_config({"APP_ENV": "preview"}).mode == "test"
    assert resolve_billing_config({}).mode == "mock"
    assert resolve_billing_config({"APP_ENV": "production"}).mode == "live"


def test_mock_is_refused_in_production() -> None:
    with pytest.raises(AppError) as raised:
        resolve_billing_config({"APP_ENV": "production", "STRIPE_MODE": "mock"})
    assert raised.value.code == "INTERNAL_ERROR"
    assert resolve_billing_config({"APP_ENV": "production", "STRIPE_MODE": "live"}).mode == "live"


def test_the_public_address_is_normalised_and_empty_values_ignored() -> None:
    config = resolve_billing_config(
        {
            "STRIPE_MODE": "test",
            "NEXT_PUBLIC_APP_URL": "https://learny.example///",
            "STRIPE_PRICE_ID": "  ",
            "STRIPE_SECRET_KEY": " sk_test_1 ",
        }
    )
    assert config.app_url == "https://learny.example"
    assert config.price_id is None
    assert config.secret_key == "sk_test_1"
    assert resolve_billing_config({}).app_url == "http://localhost:3000"
