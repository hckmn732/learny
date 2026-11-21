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
from learny.platform.llm.gateway import LlmGateway, MockGateway
from learny.platform.llm.mock import load_registry
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
    llm: LlmGateway


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
        llm=build_llm(settings),
    )


def build_llm(settings: Settings) -> LlmGateway:
    """The AI capability of the use cases (SPEC-2201).

    Only the deterministic mock adapter ships with this specification: the live providers land with
    the spec that first needs them (SPEC-2204). A non-mock `LLM_MODE` therefore fails at startup
    instead of silently serving simulated answers in production.
    """
    mode = os.environ.get("LLM_MODE", "mock")
    if mode not in ("", "mock"):
        raise RuntimeError(f"LLM_MODE={mode} is not served yet: only the mock adapter ships")
    return MockGateway(load_registry())
