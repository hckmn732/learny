"""Expiration of the pending actions (SPEC-2205, CL-3 and ET-4 of SPEC-711).

Ported from `expireDueAutomationActions` of `packages/db/src/repositories/automation-actions.ts`:
the hourly tick only expires a row that still waits for consent and whose payload carries an
`expiresAt` instant that has passed. A malformed instant cannot exist — `validateDraft` refuses it
— so the strict parse below only guards the read, it never changes an observable behaviour.
"""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from learny.shared.time import parse_iso, to_epoch_ms


def is_due_for_expiry(status: str, payload: Mapping[str, Any], now: datetime) -> bool:
    """CL-3 - the SQL predicate of the hourly tick, decided on the loaded row."""
    if status != "pending_consent":
        return False
    raw = payload.get("expiresAt")
    if not isinstance(raw, str):
        return False
    try:
        deadline = parse_iso(raw)
    except ValueError:
        return False
    return to_epoch_ms(deadline) <= to_epoch_ms(now)
