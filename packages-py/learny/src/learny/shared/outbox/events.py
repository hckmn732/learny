"""The transactional outbox as the worker sees it (SPEC-2102, ADR-2006, ADR-2014).

An event is written by `Tx.emit` inside the business transaction (`public.enqueue_event`); the
worker fans it out into one `job_deliveries` row per Python consumer, then claims and runs them
under a lease. Nothing here calls the HTTP API (ET-3).
"""

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class Event:
    """One row of `event_outbox`, as handed to a consumer."""

    event_id: str
    name: str
    data: Mapping[str, Any]
    user_id: str | None
    created_at: datetime

    def logging_fields(self) -> dict[str, Any]:
        """Safe log fields: never the payload, only its identity.

        The name is `eventName`, not `event`: structlog reserves `event` for the message itself.
        """
        return {"eventId": self.event_id, "eventName": self.name}


@dataclass(frozen=True, slots=True)
class Delivery:
    """One claimable (event, consumer) pair."""

    event_id: str
    consumer: str
    attempts: int
