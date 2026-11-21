"""Settings of the Python backend (00-conventions section 8, ADR-2011).

The variable names are the ones the TypeScript backend already reads; Python-specific needs are
prefixed with `PY_`. Nothing is renamed, so an existing deployment keeps working.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment of the facade and the worker, read once at startup."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)

    app_env: str = "local"
    # The facade relays every operation to Hono until the ownership table flips an entry.
    py_hono_upstream_url: str = "http://127.0.0.1:3102"
    ownership_overrides: str | None = None
    sentry_dsn: str | None = None
    commit: str = "unknown"
    version: str = "dev"

    # PostgreSQL (SPEC-2101).
    database_url: str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    database_pool_max: int = 10

    # Supabase (SPEC-2101): identity and storage.
    supabase_url: str = "http://127.0.0.1:54321"
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwt_audience: str = "authenticated"
    jwt_issuer_override: str | None = None

    @property
    def is_test(self) -> bool:
        return self.app_env in ("test", "local")

    @property
    def supabase_jwt_issuer(self) -> str:
        """`<SUPABASE_URL>/auth/v1` unless an explicit issuer is configured."""
        if self.jwt_issuer_override is not None:
            return self.jwt_issuer_override
        return f"{self.supabase_url.rstrip('/')}/auth/v1"
