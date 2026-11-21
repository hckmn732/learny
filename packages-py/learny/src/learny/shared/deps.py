"""The single dependency bundle of the Python backend (00-conventions section 4, ADR-2011).

`Deps` is built once at startup (`create_app`, worker `main`) and passed explicitly; there is no
container, no service locator and no module-level mutable state. Every capability is an adapter
selected from the settings, so a test can substitute one field without patching globals.
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import httpx
import structlog

from learny.identity.infrastructure.gotrue import GoTrueClient
from learny.identity.infrastructure.jwt import JwtVerifier
from learny.platform.storage import SupabaseStorage
from learny.shared.clock import Clock, from_env
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
    clock = from_env({"CLOCK_FIXED_AT": os.environ.get("CLOCK_FIXED_AT", "")})
    return Deps(
        settings=settings,
        clock=clock,
        db=Database.from_settings(settings),
        jwks=JwtVerifier(settings, clock, jwks_fetcher(settings)),
        gotrue=GoTrueClient(settings),
        storage=SupabaseStorage(settings, clock),
        logger=structlog.get_logger("learny"),
    )
