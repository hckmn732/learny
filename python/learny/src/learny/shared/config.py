"""Settings of the Python backend (00-conventions section 8, ADR-2011, ADR-2042).

Only the variables of `ENVIRONMENT_VARIABLES` are read from the process environment. Every other
setting is a constant of the code or is derived from `APP_ENV` (and from `CLOCK_FIXED_AT` for the
frozen-clock stacks); the internal secrets are subkeys of `APP_ENCRYPTION_KEY` (ADR-4007). A test
or a tool may still pass any field explicitly to `Settings(...)`.
"""

import base64
import hashlib
import hmac
import os
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import (
    BaseSettings,
    EnvSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

from learny.shared.locale_fr.details import CONFIGURATION_INVALID

RateLimitMode = Literal["on", "off"]
LlmMode = Literal["live", "mock"]
EmailMode = Literal["memory", "smtp", "resend"]
PushMode = Literal["mock", "live"]
JobsMode = Literal["worker", "inline"]

# ADR-2042 - the environment contract of the Python backend. Steady-state deployment variables
# first, then the optional ones (key rotation, SMTP target of the simulated stacks, local models,
# test and QA switches, build metadata, standard `CI`).
ENVIRONMENT_VARIABLES: tuple[str, ...] = (
    "APP_ENV",
    "NEXT_PUBLIC_APP_URL",
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWT_SECRET",
    "APP_ENCRYPTION_KEY",
    "EMAIL_FROM",
    "RESEND_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID",
    # Served to the clients by `config.public` (ADR-4007).
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "VOYAGE_API_KEY",
    "SEARCH_API_KEY",
    # Optional.
    "APP_ENCRYPTION_KEY_PREVIOUS",
    "SMTP_HOST",
    "ALLOW_LOCAL_MODELS",
    "ENABLE_SDD_PAGES",
    "CLOCK_FIXED_AT",
    "GIT_COMMIT",
    "APP_VERSION",
    # Standard variables (ADR-0227): the CI marker and the listening port of the worker health.
    "CI",
    "PORT",
)

# Constants that used to be variables (ADR-2042): identical in every environment.
DATABASE_POOL_SIZE = 5
SMTP_PORT = 1025
SUPABASE_JWT_AUDIENCE = "authenticated"
LEGAL_CGU_VERSION = "2026-11-11"
LEGAL_PRIVACY_VERSION = "2026-11-11"
DEFAULT_EMAIL_FROM = "Learny <bonjour@learny.local>"
# ADR-4007: every internal secret is an HMAC-SHA256 subkey of the master key instead of being one
# more variable. Changing `APP_ENCRYPTION_KEY` therefore rotates all of them.
RATE_LIMIT_KEY_LABEL = b"learny/rate-limit-ip/v1"
API_PROXY_KEY_LABEL = b"learny/api-proxy/v1"
EMAIL_LINK_KEY_LABEL = b"learny/email-link/v1"
VAPID_KEY_LABEL = b"learny/vapid/v1"
# Order of the P-256 group: a derived VAPID scalar lies in [1, n - 1].
P256_ORDER = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551

_SIMULATED_ENVS = ("local", "test", "development", "")
_EMAIL_ADDRESS = re.compile(r"<([^<>\s]+@[^<>\s]+)>|^\s*([^<>\s]+@[^<>\s]+)\s*$")


class _ContractEnvSource(EnvSettingsSource):
    """The process environment restricted to `ENVIRONMENT_VARIABLES` (ADR-2042)."""

    _allowed = frozenset(name.lower() for name in ENVIRONMENT_VARIABLES)

    def _load_env_vars(self) -> Mapping[str, str | None]:
        loaded = super()._load_env_vars()
        return {key: value for key, value in loaded.items() if key.lower() in self._allowed}


def _subkey(master_key: str, label: bytes) -> bytes:
    return hmac.new(master_key.strip().encode(), label, hashlib.sha256).digest()


def derive_rate_limit_secret(master_key: str) -> str:
    """HMAC-SHA256 subkey of `APP_ENCRYPTION_KEY` keying the IP hashes of the rate limiter."""
    return _subkey(master_key, RATE_LIMIT_KEY_LABEL).hex()


def derive_api_proxy_secret(master_key: str) -> str:
    """Relay secret shared by the web and the facade (`X-Learny-Proxy-Secret`, ADR-4007)."""
    return _subkey(master_key, API_PROXY_KEY_LABEL).hex()


def derive_email_link_secret(master_key: str) -> str:
    """Key of the signed e-mail links (unsubscribe, ADR-4007)."""
    return _subkey(master_key, EMAIL_LINK_KEY_LABEL).hex()


def derive_vapid_private_key(master_key: str) -> str:
    """P-256 VAPID private key, base64url of the 32-byte big-endian scalar (ADR-4007)."""
    scalar = int.from_bytes(_subkey(master_key, VAPID_KEY_LABEL), "big") % (P256_ORDER - 1) + 1
    return base64.urlsafe_b64encode(scalar.to_bytes(32, "big")).rstrip(b"=").decode()


def vapid_public_key_of(private_key: str) -> str | None:
    """The base64url P-256 public key of a `web-push generate-vapid-keys` private key."""
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

    raw = private_key.strip()
    try:
        scalar = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
        if len(scalar) != 32:
            return None
        key = ec.derive_private_key(int.from_bytes(scalar, "big"), ec.SECP256R1())
    except (ValueError, TypeError):
        return None
    point = key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(point).rstrip(b"=").decode()


def vapid_subject_of(sender: str) -> str:
    """`mailto:` contact of the push service, taken from the e-mail sender (RFC 8292)."""
    match = _EMAIL_ADDRESS.search(sender)
    address = (match.group(1) or match.group(2)) if match else None
    return f"mailto:{address or 'bonjour@learny.local'}"


class Settings(BaseSettings):
    """Environment of the facade and the worker, read once at startup."""

    model_config = SettingsConfigDict(
        env_file=None, extra="ignore", case_sensitive=False, populate_by_name=True
    )

    # --- read from the environment (ENVIRONMENT_VARIABLES) ---------------------------------------
    app_env: str = "local"
    next_public_app_url: str | None = None
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    supabase_url: str = Field(
        default="http://127.0.0.1:54321",
        validation_alias=AliasChoices("supabase_url", "NEXT_PUBLIC_SUPABASE_URL"),
    )
    supabase_anon_key: str = Field(
        default="",
        validation_alias=AliasChoices("supabase_anon_key", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    )
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    app_encryption_key: str | None = None
    # Previous master key during a rotation (ADR-0227): it keeps the former relay secret valid.
    app_encryption_key_previous: str | None = None
    email_from: str | None = None
    resend_api_key: str | None = None
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_id: str | None = None
    stripe_publishable_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("stripe_publishable_key", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
    )
    voyage_api_key: str | None = None
    search_api_key: str | None = None
    smtp_host: str | None = None
    # Raw value of the development guard (SPEC-201 ET-7): only "true" and "1" open the routes.
    enable_sdd_pages: str | None = None
    # Frozen instant of the test and QA stacks (ADR-0047); refused in production.
    clock_fixed_at: str | None = None
    # Build metadata of the health probe (SPEC-006 EF-1): the names the deployment already sets.
    git_commit: str | None = None
    app_version: str | None = None
    ci: str | None = None
    port: int = 0

    # --- derived from APP_ENV / CLOCK_FIXED_AT, never read from the environment (ADR-2042) -------
    # `None` means "derive"; a test or a tool may still pass an explicit value.
    llm_mode: LlmMode | None = None
    email_mode: EmailMode | None = None
    push_mode: PushMode | None = None
    stripe_mode: str | None = None
    jobs_mode: JobsMode | None = None
    rate_limit_mode: RateLimitMode | None = None
    # ADR-4007: subkeys of `APP_ENCRYPTION_KEY` (and of the previous key for the relay secret).
    rate_limit_ip_secret: str | None = None
    api_proxy_secret: str | None = None
    api_proxy_secret_previous: str | None = None
    email_link_secret: str | None = None
    vapid_private_key: str | None = None
    vapid_public_key: str | None = None
    vapid_subject: str | None = None

    # --- constants (ADR-2042) --------------------------------------------------------------------
    database_pool_max: int = DATABASE_POOL_SIZE
    smtp_port: int = SMTP_PORT
    supabase_jwt_audience: str = SUPABASE_JWT_AUDIENCE
    legal_cgu_version: str = LEGAL_CGU_VERSION
    legal_privacy_version: str = LEGAL_PRIVACY_VERSION
    # The legacy `TRUST_PROXY` mode is never enabled: the relay secret authenticates the proxy.
    trust_proxy: bool = False
    allowed_origins: str | None = None

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        """Explicit values first, then the contract variables of the process environment."""
        return (init_settings, _ContractEnvSource(settings_cls))

    @property
    def fixed_instant(self) -> str | None:
        """`CLOCK_FIXED_AT` unless empty or `real`."""
        value = (self.clock_fixed_at or "").strip()
        return None if value in ("", "real") else value

    @model_validator(mode="after")
    def _derive(self) -> "Settings":
        """Fills every derived setting left to `None` (ADR-2042).

        IA and push follow `APP_ENV`; e-mail goes to memory in `test`, to SMTP when `SMTP_HOST` is
        set or in local development, to Resend otherwise; Stripe follows its secret key (none:
        simulated, `sk_live_`/`rk_live_`: live, any other: test mode); a frozen clock runs the
        consumers inline in `test` and switches the limiter off outside production. The internal
        secrets are subkeys of `APP_ENCRYPTION_KEY` (ADR-4007), the VAPID private key first so that
        its public key is derived from it.
        """
        simulated = self.app_env in _SIMULATED_ENVS
        frozen = self.fixed_instant is not None
        if self.llm_mode is None:
            self.llm_mode = "mock" if simulated else "live"
        if self.push_mode is None:
            self.push_mode = "mock" if simulated else "live"
        if self.email_mode is None:
            smtp = simulated or bool((self.smtp_host or "").strip())
            self.email_mode = "memory" if self.app_env == "test" else "smtp" if smtp else "resend"
        if self.stripe_mode is None:
            key = (self.stripe_secret_key or "").strip()
            live = key.startswith(("sk_live_", "rk_live_"))
            self.stripe_mode = "live" if live else "test" if key else "mock"
        if self.jobs_mode is None:
            # The end-to-end stack runs the consumers inside the request (SPEC-2003, P21 plan).
            self.jobs_mode = "inline" if self.app_env == "test" and frozen else "worker"
        if self.rate_limit_mode is None:
            # ADR-0336: a frozen clock never refills the buckets, so the limiter is off there.
            self.rate_limit_mode = "off" if frozen and not self.is_production else "on"
        master = (self.app_encryption_key or "").strip()
        previous = (self.app_encryption_key_previous or "").strip()
        if master:
            if self.rate_limit_ip_secret is None:
                self.rate_limit_ip_secret = derive_rate_limit_secret(master)
            if self.api_proxy_secret is None:
                self.api_proxy_secret = derive_api_proxy_secret(master)
            if self.email_link_secret is None:
                self.email_link_secret = derive_email_link_secret(master)
            if self.vapid_private_key is None:
                self.vapid_private_key = derive_vapid_private_key(master)
        if self.api_proxy_secret_previous is None and previous:
            self.api_proxy_secret_previous = derive_api_proxy_secret(previous)
        if self.vapid_public_key is None and self.vapid_private_key:
            self.vapid_public_key = vapid_public_key_of(self.vapid_private_key)
        if self.vapid_subject is None:
            self.vapid_subject = vapid_subject_of(self.email_from or DEFAULT_EMAIL_FROM)
        return self

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
        """`<NEXT_PUBLIC_SUPABASE_URL>/auth/v1`."""
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @property
    def supabase_jwks(self) -> str:
        """JWKS endpoint, `<NEXT_PUBLIC_SUPABASE_URL>/auth/v1/.well-known/jwks.json`."""
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


@dataclass(frozen=True, slots=True)
class ConfigurationIssue:
    """One refused production variable: its name and a safe code, never its value (SPEC-009)."""

    name: str
    code: Literal["missing", "forbidden", "incompatible"]


class ConfigurationError(RuntimeError):
    """A production start refused before any connection: names and safe codes only."""

    code = "INVALID_ENVIRONMENT"

    def __init__(self, scope: str, issues: Iterable[ConfigurationIssue]) -> None:
        unique: dict[str, ConfigurationIssue] = {}
        for issue in issues:
            unique.setdefault(issue.name, issue)
        self.scope = scope
        self.names: tuple[str, ...] = tuple(sorted(unique))
        self.issues: tuple[ConfigurationIssue, ...] = tuple(unique[name] for name in self.names)
        super().__init__(CONFIGURATION_INVALID.format(scope=scope, names=", ".join(self.names)))


PRODUCTION_REQUIRED_ENV: tuple[str, ...] = (
    "APP_ENCRYPTION_KEY",
    "DATABASE_URL",
    "EMAIL_FROM",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "RESEND_API_KEY",
    "STRIPE_PRICE_ID",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VOYAGE_API_KEY",
)


def production_configuration_issues(
    settings: Settings,
    environ: Mapping[str, str] | None = None,
) -> tuple[ConfigurationIssue, ...]:
    """Every reason an APP_ENV=production start is incomplete; empty when it is valid.

    Only names and safe codes leave this function: a secret value is never copied, logged or
    rendered (SPEC-009 CA-2, CL-7). Missing variables are read from the process environment, never
    from the documented defaults, so a default cannot hide an absent production secret.
    """
    values = os.environ if environ is None else environ
    issues: list[ConfigurationIssue] = [
        ConfigurationIssue(name, "missing")
        for name in PRODUCTION_REQUIRED_ENV
        if not values.get(name, "").strip()
    ]
    forbidden = (
        ("LLM_MODE", settings.llm_mode, "mock"),
        ("RATE_LIMIT_MODE", settings.rate_limit_mode, "off"),
        ("STRIPE_MODE", settings.stripe_mode, "mock"),
        ("EMAIL_MODE", settings.email_mode, "memory"),
        ("PUSH_MODE", settings.push_mode, "mock"),
        ("JOBS_MODE", settings.jobs_mode, "inline"),
    )
    for variable, value, refused in forbidden:
        if value == refused:
            issues.append(ConfigurationIssue(variable, "forbidden"))
    if (settings.enable_sdd_pages or "").strip() == "true":
        issues.append(ConfigurationIssue("ENABLE_SDD_PAGES", "forbidden"))
    if settings.fixed_instant is not None:
        issues.append(ConfigurationIssue("CLOCK_FIXED_AT", "forbidden"))
    for variable, url in (
        ("NEXT_PUBLIC_APP_URL", settings.next_public_app_url),
        ("NEXT_PUBLIC_SUPABASE_URL", settings.supabase_url),
    ):
        if url is not None and not url.startswith("https://"):
            issues.append(ConfigurationIssue(variable, "incompatible"))
    return tuple(issues)


def ensure_production_configuration(
    settings: Settings,
    environ: Mapping[str, str] | None = None,
) -> None:
    """Refuses an incomplete APP_ENV=production start (SPEC-009, CA-2)."""
    if not settings.is_production:
        return
    issues = production_configuration_issues(settings, environ)
    if issues:
        raise ConfigurationError("production", issues)


def load_settings() -> Settings:
    """Reads the process environment once and applies the startup guards of the deployment.

    The API (`uvicorn learny_api.main:app`) and the worker (`python -m learny_worker`) both enter
    through this function; an explicit `Settings(...)` (tests, tooling) owns its own configuration.
    """
    settings = Settings()
    ensure_production_configuration(settings)
    return settings
