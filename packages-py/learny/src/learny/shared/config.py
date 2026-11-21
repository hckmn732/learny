"""Settings of the Python facade (00-conventions section 8, ADR-2011).

The variable names are the ones the TypeScript backend already reads; Python-specific needs are
prefixed with `PY_`. Nothing is renamed, so an existing deployment keeps working.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment of the facade, read once at startup."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)

    app_env: str = "local"
    # The facade relays every operation to Hono until the ownership table flips an entry.
    py_hono_upstream_url: str = "http://127.0.0.1:3102"
    ownership_overrides: str | None = None
    sentry_dsn: str | None = None
    commit: str = "unknown"
    version: str = "dev"

    @property
    def is_test(self) -> bool:
        return self.app_env in ("test", "local")
