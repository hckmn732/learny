"""Settings of the Python backend (00-conventions section 8, ADR-2011).

The variable names are the ones the TypeScript backend already reads; Python-specific needs are
prefixed with `PY_`. Nothing is renamed, so an existing deployment keeps working.
"""

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

RateLimitMode = Literal["on", "off"]
LlmMode = Literal["live", "mock"]
EmailMode = Literal["memory", "smtp", "resend"]
PushMode = Literal["mock", "live"]


class Settings(BaseSettings):
    """Environment of the facade and the worker, read once at startup."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)

    app_env: str = "local"
    # The facade relays every operation to Hono until the ownership table flips an entry.
    py_hono_upstream_url: str = "http://127.0.0.1:3102"
    # Raw value of the development guard (SPEC-201 ET-7): only "true" and "1" open the routes.
    enable_sdd_pages: str | None = None
    ownership_overrides: str | None = None
    sentry_dsn: str | None = None
    commit: str = "unknown"
    version: str = "dev"
    # Build metadata of the health probe (SPEC-006 EF-1): the names the deployment already sets.
    git_commit: str | None = None
    app_version: str | None = None

    # PostgreSQL (SPEC-2101).
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    database_pool_max: int = 10

    # Supabase (SPEC-2101): identity and storage.
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwt_audience: str = "authenticated"
    supabase_jwks_url: str | None = None
    jwt_issuer_override: str | None = None

    # HTTP protections (SPEC-208, ported by SPEC-2101).
    next_public_app_url: str | None = None
    allowed_origins: str | None = None
    api_proxy_secret: str | None = None
    api_proxy_secret_previous: str | None = None
    trust_proxy: bool = False
    rate_limit_mode: RateLimitMode = "on"
    rate_limit_ip_secret: str | None = None

    # Legal documents whose acceptance is tracked (SPEC-806, ported by SPEC-2101).
    legal_cgu_version: str = "2026-11-11"
    legal_privacy_version: str = "2026-11-11"

    # AI providers (SPEC-2203): mock outside production, secrets stay server-side.
    llm_mode: LlmMode = "mock"

    # E-mail and browser push (SPEC-2205): the same variables the TypeScript backend reads.
    email_mode: EmailMode | None = None
    email_from: str | None = None
    email_link_secret: str | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    resend_api_key: str | None = None
    push_mode: PushMode | None = None
    vapid_subject: str | None = None
    vapid_public_key: str | None = None
    vapid_private_key: str | None = None
    ci: str | None = None
    voyage_api_key: str | None = None
    search_api_key: str | None = None

    # Payment provider (SPEC-2206): the same variables the TypeScript backend reads.
    stripe_mode: str | None = None
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_id: str | None = None

    # Asynchronous execution (SPEC-2102): jobs mode and worker tuning.
    jobs_mode: str = "worker"
    py_dispatch_interval_ms: int = 500
    py_dispatch_batch_size: int = 100
    py_worker_concurrency: int = 8
    py_worker_poll_interval_ms: int = 500
    py_worker_health_port: int = 0
    py_scheduler_retry_interval_s: int = 15
    py_scheduler_poll_interval_s: int = 20

    def billing_env(self) -> dict[str, str | None]:
        """The mapping `resolve_billing_config` reads, built from the settings."""
        return {
            "APP_ENV": self.app_env,
            "STRIPE_MODE": self.stripe_mode,
            "STRIPE_SECRET_KEY": self.stripe_secret_key,
            "STRIPE_WEBHOOK_SECRET": self.stripe_webhook_secret,
            "STRIPE_PRICE_ID": self.stripe_price_id,
            "NEXT_PUBLIC_APP_URL": self.next_public_app_url,
        }

    @property
    def database_configured(self) -> bool:
        """`DATABASE_URL` explicitly set: without it the probe answers `not_configured`."""
        return "database_url" in self.model_fields_set

    @property
    def is_test(self) -> bool:
        return self.app_env in ("test", "local")

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def supabase_jwt_issuer(self) -> str:
        """`<SUPABASE_URL>/auth/v1` unless an explicit issuer is configured."""
        if self.jwt_issuer_override is not None:
            return self.jwt_issuer_override
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def supabase_jwks(self) -> str:
        """JWKS endpoint, `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` by default."""
        if self.supabase_jwks_url is not None:
            return self.supabase_jwks_url
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
