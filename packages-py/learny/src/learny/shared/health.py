"""Health probe of the facade (port of `packages/api-routes/src/deps/health.ts`, SPEC-006 EF-2).

The probe runs one trivial query with a bounded delay; its result and its error message are
ignored, so no connection string and no driver message ever reaches the answer. A database that is
not explicitly configured stays `not_configured` instead of probing a local default, exactly like
`registerDatabaseHealth`.
"""

import asyncio
import re
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any, Literal

DatabaseStatus = Literal["ok", "unavailable", "not_configured"]
ComponentStatus = Literal["ok", "unavailable", "not_configured"]

HEALTH_PROBE_TIMEOUT_MS = 2000
VERSION_PATTERN = re.compile(r"^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$")
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{7,40}$")
HEALTH_HEADERS = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
}

DatabaseQuery = Callable[[], Awaitable[Any]]


@dataclass(frozen=True, slots=True)
class BuildInfo:
    """The two deployment identifiers of the answer, already restricted to a safe format."""

    version: str
    commit: str


def build_info(env: Mapping[str, str | None]) -> BuildInfo:
    """`buildInfo`: an out-of-format value never leaks, it falls back to `dev` or `unknown`."""
    version = env.get("APP_VERSION") or ""
    commit = (env.get("GIT_COMMIT") or "").lower()
    return BuildInfo(
        version=version if VERSION_PATTERN.match(version) is not None else "dev",
        commit=commit if COMMIT_PATTERN.match(commit) is not None else "unknown",
    )


def build_status(build: BuildInfo) -> ComponentStatus:
    """EF-5: the build is `not_configured` while it still answers its safe defaults."""
    return "not_configured" if build.version == "dev" or build.commit == "unknown" else "ok"


async def probe_database(
    query: DatabaseQuery | None,
    timeout_ms: int = HEALTH_PROBE_TIMEOUT_MS,
) -> DatabaseStatus:
    """`probeDatabase`: any failure or timeout is `unavailable`, never a driver message."""
    if query is None:
        return "not_configured"
    try:
        async with asyncio.timeout(timeout_ms / 1000):
            await query()
    except Exception:
        return "unavailable"
    return "ok"


def health_body(database: DatabaseStatus, build: BuildInfo) -> dict[str, Any]:
    """The answer document, in the field order of `HealthResponse.parse`."""
    return {
        "status": "ok" if database == "ok" else "degraded",
        "version": build.version,
        "commit": build.commit,
        "database": database,
        "components": {"database": database, "build": build_status(build)},
    }


async def get_health(
    query: DatabaseQuery | None,
    env: Mapping[str, str | None],
    timeout_ms: int = HEALTH_PROBE_TIMEOUT_MS,
) -> tuple[int, dict[str, Any]]:
    """`getHealth`: the HTTP status and the body of the probe (503 only when unavailable)."""
    database = await probe_database(query, timeout_ms)
    build = build_info(env)
    return (503 if database == "unavailable" else 200), health_body(database, build)
