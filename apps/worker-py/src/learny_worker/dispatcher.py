"""Outbox dispatcher: fans undocumented outbox events out to Python deliveries (SPEC-2102 step 3).

One service transaction per batch: the batch statement stamps `dispatched_at` and returns the
events, then one `job_deliveries` row is inserted per Python consumer subscribed to the event.
A payload the consumer rejects is written as a `failed` delivery instead of being retried.
"""

import asyncio
from typing import Any

import structlog
from learny.shared.outbox import deliveries as outbox

from learny_worker.consumers import Consumer, Ownership, active_consumers

DISPATCH_BATCH_SIZE = 100
DEFAULT_DISPATCH_INTERVAL_MS = 500


class Dispatcher:
    """Polls the outbox and creates one delivery per (event, Python consumer)."""

    def __init__(
        self,
        deps: Any,
        ownership: Ownership,
        *,
        interval_ms: int = DEFAULT_DISPATCH_INTERVAL_MS,
        batch_size: int = DISPATCH_BATCH_SIZE,
        consumers: tuple[Consumer, ...] | None = None,
        logger: Any = None,
    ) -> None:
        self._deps = deps
        self._ownership = ownership
        self._interval = max(interval_ms, 1) / 1000
        self._batch_size = batch_size
        self._consumers = consumers if consumers is not None else active_consumers(ownership)
        self._logger = logger or structlog.get_logger("learny.worker.dispatcher")

    async def dispatch_once(self) -> int:
        """Fans out one batch and returns the number of deliveries created."""
        created = 0
        async with self._deps.db.service_tx() as tx:
            events = await outbox.take_batch(tx, self._batch_size)
            if not events:
                return 0
            now = self._deps.clock.now()
            for event in events:
                for consumer in self._subscribed(event.name):
                    try:
                        consumer.check(event)
                    except Exception as error:
                        await outbox.schedule_failed_delivery(tx, event, consumer.name, str(error))
                        created += 1
                        self._logger.warning(
                            "delivery rejected",
                            job=consumer.name,
                            code=getattr(error, "code", type(error).__name__),
                            **event.logging_fields(),
                        )
                        continue
                    delay = consumer.run_after(event, self._deps.clock)
                    await outbox.schedule_delivery(tx, event, consumer.name, delay or now)
                    created += 1
        if created:
            self._logger.info("outbox dispatched", count=created)
        return created

    async def run(self, stop: asyncio.Event) -> None:
        """Polls until `stop` is set; a database error is logged and retried on the next tick."""
        while not stop.is_set():
            try:
                await self.dispatch_once()
            except Exception as error:
                self._logger.error("dispatch failed", code=type(error).__name__, error=str(error)[:200])
            try:
                await asyncio.wait_for(stop.wait(), timeout=self._interval)
            except TimeoutError:
                continue

    def _subscribed(self, event_name: str) -> tuple[Consumer, ...]:
        return tuple(consumer for consumer in self._consumers if consumer.on == event_name)
