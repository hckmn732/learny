"""Harness of the consumer integration tests (SPEC-2207).

The real dispatcher and runner run on the local stack, inside the service transaction that
`rolled_back` always reverts: every event, delivery and business row of a test disappears at the
end. The consumers are the ones of the registry, selected by name, so a test proves the wiring of
the plan and not a local re-implementation.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from factories.engagement_deps import engagement_deps
from learny.shared.ownership import Owner
from learny.shared.time import parse_iso
from learny_worker.consumers import CONSUMERS, Consumer
from learny_worker.dispatcher import Dispatcher
from learny_worker.runner import Runner
from sqlalchemy import text

FIXED = parse_iso("2026-11-11T12:20:00Z")
OLD = parse_iso("2020-01-01T00:00:00Z")


def consumer_named(name: str) -> Consumer:
    return next(consumer for consumer in CONSUMERS if consumer.name == name)


def consumers_for(names: tuple[str, ...]) -> tuple[Consumer, ...]:
    return tuple(consumer_named(name) for name in names)


@dataclass(frozen=True)
class Ownership:
    """Every selected consumer is Python-owned, like the real table after the flip."""

    consumers: dict[str, Owner]


@dataclass
class Harness:
    """The dispatcher and the runner of one test, with the dependency bundle they share."""

    deps: Any
    consumers: tuple[Consumer, ...]
    dispatcher: Dispatcher
    runner: Runner

    async def drain(self) -> tuple[int, int]:
        """Fans the pending events out, then runs the due deliveries once."""
        created = await self.dispatcher.dispatch_once()
        ran = await self.runner.run_once()
        return created, ran


def harness(tx: Any, names: tuple[str, ...], *, now: datetime = FIXED) -> Harness:
    deps = engagement_deps(tx, now=now)
    consumers = consumers_for(names)
    ownership = Ownership({consumer.name: "py" for consumer in consumers})
    return Harness(
        deps=deps,
        consumers=consumers,
        dispatcher=Dispatcher(deps, ownership, consumers=consumers, interval_ms=1),
        runner=Runner(deps, consumers, concurrency=1, poll_interval_ms=1),
    )


async def emit_event(tx: Any, name: str, data: dict[str, Any], event_id: str) -> str:
    """Writes one event and dates it before every other pending row of the shared outbox."""
    await tx.emit(name, data, event_id=event_id)
    await tx.conn.execute(
        text("update public.event_outbox set created_at = :old where event_id = :id"),
        {"old": OLD, "id": event_id},
    )
    return event_id


async def delivery(tx: Any, event_id: str, consumer: str) -> dict[str, Any] | None:
    rows = (
        (
            await tx.conn.execute(
                text(
                    "select status::text as status, attempts, run_after, last_error "
                    "from public.job_deliveries where event_id = :id and consumer = :consumer"
                ),
                {"id": event_id, "consumer": consumer},
            )
        )
        .mappings()
        .all()
    )
    return None if not rows else dict(rows[0])


async def outbox_event(tx: Any, event_id: str) -> dict[str, Any] | None:
    rows = (
        (
            await tx.conn.execute(
                text(
                    "select event_id, name, data, user_id::text as user_id, created_at "
                    "from public.event_outbox where event_id = :id"
                ),
                {"id": event_id},
            )
        )
        .mappings()
        .all()
    )
    return None if not rows else dict(rows[0])


async def count(tx: Any, statement: str, **parameters: Any) -> int:
    return int((await tx.conn.execute(text(statement), parameters)).scalar_one())


async def event_ids(tx: Any, prefix: str) -> list[str]:
    rows = await tx.conn.execute(
        text("select event_id from public.event_outbox where event_id like :prefix order by event_id"),
        {"prefix": f"{prefix}%"},
    )
    return [str(row[0]) for row in rows.all()]


__all__ = [
    "FIXED",
    "OLD",
    "Harness",
    "Ownership",
    "consumer_named",
    "consumers_for",
    "count",
    "delivery",
    "emit_event",
    "event_ids",
    "harness",
    "outbox_event",
]
