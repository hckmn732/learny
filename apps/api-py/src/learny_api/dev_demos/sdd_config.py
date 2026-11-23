"""Demonstration of the server configuration (SPEC-2302, port of `deps/env.ts`).

`buildSddConfigDemo` answers the modes of the running environment, the presence of the six public
values (a boolean, never a value) and the names the simulated production environment would refuse.
The names are copied from `packages/config/src/env.ts`; no secret is ever read or returned.
"""

import os
from typing import Any

from learny_api.dev_demos.guard import require_dev
from learny_api.pipeline import Call

SERVER_ENV_KEYS = (
    "NODE_ENV",
    "APP_ENV",
    "APP_ENCRYPTION_KEY",
    "APP_ENCRYPTION_KEY_PREVIOUS",
    "LOG_LEVEL",
    "APP_VERSION",
    "GIT_COMMIT",
    "API_INTERNAL_URL",
    "API_PROXY_SECRET",
    "API_PROXY_SECRET_PREVIOUS",
    "LEARNY_API_ROLE",
    "API_PORT",
    "RATE_LIMIT_IP_SECRET",
    "RATE_LIMIT_MODE",
    "TRUST_PROXY",
    "ALLOWED_ORIGINS",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWT_SECRET",
    "SUPABASE_JWKS_URL",
    "DATABASE_URL",
    "DATABASE_POOL_MAX",
    "DB_LOG_QUERIES",
    "LLM_MODE",
    "ANTHROPIC_API_KEY",
    "LLM_LIVE_TESTS",
    "ALLOW_LOCAL_MODELS",
    "VOYAGE_API_KEY",
    "EMBEDDING_DIM",
    "SEARCH_API_KEY",
    "JOBS_MODE",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
    "INNGEST_DEV",
    "EMAIL_MODE",
    "SMTP_HOST",
    "SMTP_PORT",
    "EMAIL_FROM",
    "RESEND_API_KEY",
    "EMAIL_LINK_SECRET",
    "MAILPIT_URL",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
    "PUSH_MODE",
    "STRIPE_MODE",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID",
    "SENTRY_DSN",
    "SENTRY_AUTH_TOKEN",
    "LEGAL_ENTITY_NAME",
    "LEGAL_ENTITY_ADDRESS",
    "LEGAL_CONTACT_EMAIL",
    "LEGAL_HOST_NAME",
    "LEGAL_CGU_VERSION",
    "LEGAL_PRIVACY_VERSION",
    "CLOCK_FIXED_AT",
    "ENABLE_SDD_PAGES",
    "DEEPGRAM_API_KEY",
)
PUBLIC_ENV_KEYS = (
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SENTRY_DSN",
)
PRODUCTION_REQUIRED_KEYS = (
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
    "APP_ENCRYPTION_KEY",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
    "VOYAGE_API_KEY",
    "RESEND_API_KEY",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "RATE_LIMIT_IP_SECRET",
    "EMAIL_LINK_SECRET",
    "LEGAL_ENTITY_NAME",
    "LEGAL_ENTITY_ADDRESS",
    "LEGAL_CONTACT_EMAIL",
    "LEGAL_HOST_NAME",
    "API_INTERNAL_URL",
    "API_PROXY_SECRET",
)
# The simulated production environment of the demonstration supplies these two values only.
SIMULATED_PRODUCTION = {"APP_ENV": "production", "DATABASE_URL": "postgresql://demo/demo"}
SIMULATED_KEYS = (
    "APP_ENCRYPTION_KEY",
    "ANTHROPIC_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VAPID_PRIVATE_KEY",
    "STRIPE_SECRET_KEY",
    "RESEND_API_KEY",
)


def _stripe_mode(settings: Any) -> str:
    if settings.stripe_mode is not None:
        return str(settings.stripe_mode)
    return "live" if settings.app_env == "production" else "test" if settings.app_env == "preview" else "mock"


def _email_mode(settings: Any) -> str:
    if settings.email_mode is not None:
        return str(settings.email_mode)
    if settings.app_env in ("local", "test"):
        return "memory" if settings.app_env == "test" else "smtp"
    return "resend"


def _push_mode(settings: Any) -> str:
    if settings.push_mode is not None:
        return str(settings.push_mode)
    return "mock" if settings.app_env in ("local", "test") else "live"


def invalid_fields() -> list[str]:
    """`configurationErrorNames`: the names the simulated production environment refuses."""
    refused = [name for name in PRODUCTION_REQUIRED_KEYS if name not in SIMULATED_PRODUCTION]
    return [*refused, "ENABLE_SDD_PAGES"]


async def spec_009(call: Call) -> dict[str, Any]:
    """`devSddSpec009Demo`: the environment, the public presence and the refused names."""
    require_dev(call.deps)
    settings = call.deps.settings
    return {
        "appEnv": str(settings.app_env),
        "modes": {
            "llm": str(settings.llm_mode),
            "stripe": _stripe_mode(settings),
            "email": _email_mode(settings),
            "push": _push_mode(settings),
        },
        "publicConfigured": {key: os.environ.get(key) is not None for key in PUBLIC_ENV_KEYS},
        "serverCount": len(SERVER_ENV_KEYS),
        "simulated": {key: True for key in SIMULATED_KEYS},
        "invalidFields": invalid_fields(),
    }
