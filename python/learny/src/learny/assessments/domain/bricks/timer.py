"""Server-authoritative exam timer (SPEC-502 EF-7, CL-8, BR-PRA-03).

The caller passes the server instant as epoch milliseconds, the Python analogue of `Date#getTime`;
the function never reads the system clock.
"""

import math
from typing import Any


def _pad(value: int) -> str:
    return f"{value:02d}"


def format_remaining(remaining_ms: float | int) -> str:
    """`mm:ss`, or `h:mm:ss` beyond 59:59 (EF-7)."""
    total_seconds = math.ceil(max(0, remaining_ms) / 1000)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    if hours > 0:
        return f"{hours}:{_pad(minutes)}:{_pad(seconds)}"
    return f"{_pad(minutes)}:{_pad(seconds)}"


def timer_state(
    *,
    started_at_ms: float | int,
    duration_sec: int,
    warn_at_sec: int,
    now_ms: float | int,
) -> dict[str, Any]:
    """Remaining time, display, warning and expiry of one timed activity (EF-7, CL-8)."""
    total_ms = duration_sec * 1000
    elapsed_ms = now_ms - started_at_ms
    # A clock set back before the start never grants more than the initial duration (CL-8).
    remaining_ms = min(total_ms, max(0, total_ms - elapsed_ms))
    expired = remaining_ms == 0
    return {
        "remainingMs": remaining_ms,
        "display": format_remaining(remaining_ms),
        # Orange strictly under the warning threshold; an expired timer reports `expired` instead.
        "warning": not expired and remaining_ms < warn_at_sec * 1000,
        "expired": expired,
    }


__all__ = ["format_remaining", "timer_state"]
