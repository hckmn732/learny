"""The single dependency bundle of the Python backend (00-conventions section 4, ADR-2011).

`Deps` is built once at startup (`create_app`, worker `main`) and passed explicitly; there is no
container, no service locator and no module-level mutable state. Every capability is an adapter
selected from the settings, so a test can substitute one field without patching globals.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import httpx
import structlog

from learny.billing.domain.config import resolve_billing_config
from learny.engagement.infrastructure.email import (
    EmailConfig,
    EmailTransport,
    build_email_config,
    create_email_transport,
)
from learny.engagement.infrastructure.push import PushTransport, create_push_transport
from learny.identity.infrastructure.gotrue import GoTrueClient
from learny.identity.infrastructure.jwt import JwtVerifier
from learny.platform.llm.gateway import LlmGateway, MockGateway
from learny.platform.llm.mock import load_registry
from learny.platform.storage import SupabaseStorage
from learny.platform.stripe import StripeGateway, WebhookJournal, build_stripe_gateway
from learny.shared.clock import Clock, SystemClock, from_env
from learny.shared.config import Settings
from learny.shared.db.uow import Database

JWKS_TIMEOUT_SECONDS = 10.0


@dataclass(frozen=True, slots=True)
class Deps:
    """The capabilities a use case receives."""

    settings: Settings
    clock: Clock
    db: Database
    jwks: JwtVerifier
    gotrue: GoTrueClient
    storage: SupabaseStorage
    logger: Any
    llm: LlmGateway
    email_config: EmailConfig
    email: EmailTransport
    push: PushTransport
    stripe: StripeGateway
    webhook_journal: WebhookJournal | None


def jwks_fetcher(settings: Settings) -> Any:
    """Downloads the Supabase key set; `JwtVerifier` bounds the refresh to one per ten minutes."""

    async def fetch() -> Mapping[str, Any]:
        async with httpx.AsyncClient(timeout=JWKS_TIMEOUT_SECONDS) as client:
            response = await client.get(settings.supabase_jwks)
            response.raise_for_status()
            document: Any = response.json()
            return document if isinstance(document, dict) else {}

    return fetch


def build_deps(settings: Settings) -> Deps:
    """Builds the bundle from the settings; the caller owns the lifecycle of the pools."""
    clock = from_env({"CLOCK_FIXED_AT": settings.fixed_instant or ""})
    email_config = build_email_config(settings)
    stripe = build_stripe_gateway(resolve_billing_config(settings.billing_env()), clock)
    # EF-8 - the simulated mode keeps the recent webhook outcomes in memory (dev routes, SPEC-2207).
    webhook_journal = WebhookJournal() if stripe.mode == "mock" else None
    return Deps(
        settings=settings,
        clock=clock,
        db=Database.from_settings(settings),
        jwks=JwtVerifier(settings, clock, jwks_fetcher(settings)),
        gotrue=GoTrueClient(settings),
        # The Storage gateway signs with the **system** clock: Supabase checks `exp` against its own clock,
        # never against the injected one.
        storage=SupabaseStorage(settings, SystemClock()),
        logger=structlog.get_logger("learny"),
        llm=build_llm(settings),
        email_config=email_config,
        email=create_email_transport(email_config, clock),
        push=build_push(settings, clock),
        stripe=stripe,
        webhook_journal=webhook_journal,
    )


def build_push(settings: Settings, clock: Clock) -> PushTransport:
    """The browser push transport of the configuration (SPEC-2205).

    `mock` outside production (derived from `APP_ENV`, ADR-2042), `live` only with the VAPID key:
    the public key and the subject are derived from it and from `EMAIL_FROM`, so a production
    process without the private key fails at startup instead of silently dropping every push.
    """
    return create_push_transport(
        settings.push_mode or "mock",
        clock=clock,
        ci=settings.ci,
        subject=settings.vapid_subject,
        public_key=settings.vapid_public_key,
        private_key=settings.vapid_private_key,
    )


def build_llm(settings: Settings) -> LlmGateway:
    """The AI capability of the use cases (SPEC-2201).

    Only the deterministic mock adapter ships with this specification: the live providers land with
    the spec that first needs them (SPEC-2204). A non-mock mode (derived from `APP_ENV`, ADR-2042)
    therefore fails at startup instead of silently serving simulated answers in production.
    """
    mode = settings.llm_mode or "mock"
    if mode != "mock":
        raise RuntimeError(f"LLM_MODE={mode} is not served yet: only the mock adapter ships")
    return MockGateway(load_registry())
