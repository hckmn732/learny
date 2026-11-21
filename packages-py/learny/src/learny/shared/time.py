"""ISO-8601 handling shared by every context (00-conventions section 7).

Boundary values stay strings in the contract; they become `datetime` only inside use cases.
"""

from datetime import UTC, datetime


def parse_iso(value: str) -> datetime:
    """Parses an ISO-8601 instant (`Z` or offset) into an aware UTC datetime."""
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError(f"instant without a timezone: {value}")
    return parsed.astimezone(UTC)


def to_iso(instant: datetime) -> str:
    """Renders an instant exactly like `Date.prototype.toISOString()`."""
    if instant.tzinfo is None:
        raise ValueError("an instant must be timezone-aware")
    return instant.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
