"""ISO-8601 instants and the injectable clock (00-conventions section 7, ADR-0047).

Business code never reads the system clock: it calls `deps.clock.now()`. Tests run with a frozen
instant through `CLOCK_FIXED_AT`.
"""

from datetime import UTC, datetime
from typing import Protocol

from learny.shared.time import parse_iso


class Clock(Protocol):
    """The only source of time for business code."""

    def now(self) -> datetime:
        """Current instant, always timezone-aware and in UTC."""
        ...


class SystemClock:
    """Production clock."""

    def now(self) -> datetime:
        return datetime.now(UTC)


class FixedClock:
    """Deterministic clock of the test environment (`CLOCK_FIXED_AT`)."""

    def __init__(self, instant: datetime) -> None:
        if instant.tzinfo is None:
            raise ValueError("the fixed instant must be timezone-aware")
        self._instant = instant

    def now(self) -> datetime:
        return self._instant


def from_env(env: dict[str, str] | None = None) -> Clock:
    """Builds the clock from the environment: `CLOCK_FIXED_AT` wins when present."""
    values = env if env is not None else {}
    fixed = values.get("CLOCK_FIXED_AT")
    if fixed:
        return FixedClock(parse_iso(fixed))
    return SystemClock()
