"""Billing configuration read from the environment (port of `billing/config.ts`, SPEC-210 ADR-0215).

`STRIPE_MODE=mock` is refused in production here too (defence in depth: the settings already refuse
it at startup). Pure: the mapping is passed in, nothing is read from the process environment.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

from learny.shared.errors import AppError
from learny.shared.locale_fr import billing as fr

StripeMode = Literal["mock", "test", "live"]

STRIPE_MODES: tuple[str, ...] = ("mock", "test", "live")
DEFAULT_APP_URL = "http://localhost:3000"
WEBHOOK_TOLERANCE_SECONDS = 300


@dataclass(frozen=True, slots=True)
class BillingConfig:
    """Everything the billing service reads from the configuration."""

    mode: StripeMode
    secret_key: str | None
    webhook_secret: str | None
    price_id: str | None
    app_url: str


def default_mode(app_env: str | None) -> StripeMode:
    """`mock` in local and test, `test` in preview, `live` in production."""
    if app_env == "production":
        return "live"
    if app_env == "preview":
        return "test"
    return "mock"


def _clean(value: str | None) -> str | None:
    if value is None or value.strip() == "":
        return None
    return value.strip()


def resolve_billing_config(env: Mapping[str, str | None]) -> BillingConfig:
    """`resolveBillingConfig`: same defaults, same production guard, same trimming."""
    requested = _clean(env.get("STRIPE_MODE"))
    mode: StripeMode = requested if requested in STRIPE_MODES else default_mode(env.get("APP_ENV"))  # type: ignore[assignment]
    if mode == "mock" and env.get("APP_ENV") == "production":
        raise AppError("INTERNAL_ERROR", fr.MOCK_FORBIDDEN_IN_PRODUCTION)
    app_url = _clean(env.get("NEXT_PUBLIC_APP_URL")) or DEFAULT_APP_URL
    return BillingConfig(
        mode=mode,
        secret_key=_clean(env.get("STRIPE_SECRET_KEY")),
        webhook_secret=_clean(env.get("STRIPE_WEBHOOK_SECRET")),
        price_id=_clean(env.get("STRIPE_PRICE_ID")),
        app_url=app_url.rstrip("/"),
    )
