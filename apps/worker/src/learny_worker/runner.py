"""Delivery runner: claims deliveries under a lease and runs their consumer (SPEC-2102 step 4).

A claim increments `attempts` and sets `locked_until` on the database clock, so a killed worker
leaves a delivery that becomes claimable again when the lease expires (CL-1). Success is `done`;
`PermanentJobError` or the last attempt is `failed`; anything else is rescheduled with the bounded
exponential backoff. Two workers never take the same delivery (`skip locked`, CL-2).

One batch is awaited as a whole: `SIGTERM` therefore lets the batch in flight finish before the
process exits (ET-1), and the next start claims whatever the interrupted batch left behind.
"""

import asyncio
import time
from datetime import timedelta
from typing import Any

import structlog
from learny.platform.llm.caller import ai_caller
from learny.shared.outbox import deliveries as outbox
from learny.shared.outbox.errors import PermanentJobError
from learny.shared.outbox.events import Delivery, Event

from learny_worker.consumers import Consumer

LEASE_MARGIN_SECONDS = 30
# `JOBS_MODE=inline`: how long a request waits for the deliveries of its events, and how often it
# looks again when another process holds them (the worker dispatcher took them first).
INLINE_SETTLE_TIMEOUT_S = 30
INLINE_SETTLE_POLL_S = 0.05
DEFAULT_CONCURRENCY = 8
DEFAULT_POLL_INTERVAL_MS = 500


class Runner:
    """Claims due deliveries and executes their consumer with a per-consumer timeout."""

    def __init__(
        self,
        deps: Any,
        consumers: tuple[Consumer, ...],
        *,
        concurrency: int = DEFAULT_CONCURRENCY,
        poll_interval_ms: int = DEFAULT_POLL_INTERVAL_MS,
        logger: Any = None,
    ) -> None:
        self._deps = deps
        self._by_name = {consumer.name: consumer for consumer in consumers}
        self._concurrency = max(1, concurrency)
        self._poll_interval = max(poll_interval_ms, 1) / 1000
        self._logger = logger or structlog.get_logger("learny.worker.runner")

    def lease_seconds(self, consumer: Consumer) -> int:
        """The lease outlives the consumer timeout, so a slow delivery is never stolen."""
        return consumer.timeout_s + LEASE_MARGIN_SECONDS

    async def run_once(self, free_slots: int | None = None) -> int:
        """Claims and executes at most `free_slots` deliveries; returns how many ran."""
        slots = self._concurrency if free_slots is None else min(free_slots, self._concurrency)
        if slots <= 0:
            return 0
        async with self._deps.db.service_tx() as tx:
            claimed = await outbox.claim(
                tx,
                now=self._deps.clock.now(),
                lease_seconds=self._max_lease(),
                free_slots=slots,
            )
        if not claimed:
            return 0
        await asyncio.gather(
            *(self._run(item.delivery, item.event) for item in claimed),
            return_exceptions=False,
        )
        return len(claimed)

    async def run_events(self, event_ids: list[str], *, exclude: tuple[str, ...] = ()) -> None:
        """Runs the deliveries of the given events until none is pending or running (inline mode).

        A failed attempt is rescheduled and claimed again at once (the delays are ignored), so the
        loop ends with every delivery `done` or `failed`; deliveries another process holds are
        awaited, at most `INLINE_SETTLE_TIMEOUT_S`.
        """
        loop = asyncio.get_running_loop()
        deadline = loop.time() + INLINE_SETTLE_TIMEOUT_S
        while True:
            async with self._deps.db.service_tx() as tx:
                claimed = await outbox.claim_events(tx, event_ids, self._max_lease(), exclude=exclude)
            if claimed:
                await asyncio.gather(*(self._run(item.delivery, item.event) for item in claimed))
                continue
            async with self._deps.db.service_tx() as tx:
                unsettled = await outbox.unsettled(tx, event_ids, exclude=exclude)
            if unsettled == 0 or loop.time() >= deadline:
                return
            await asyncio.sleep(INLINE_SETTLE_POLL_S)

    async def execute(self, delivery: Delivery, event: Event) -> None:
        """Runs one already-claimed delivery (used by the integration tests of the crash path)."""
        await self._run(delivery, event)

    async def run(self, stop: asyncio.Event) -> None:
        """Claims until `stop`; the batch in flight always finishes before returning (ET-1)."""
        self._logger.info("runner started", concurrency=self._concurrency)
        while not stop.is_set():
            ran = 0
            try:
                ran = await self.run_once()
            except Exception as error:
                self._logger.error("claim failed", code=type(error).__name__, error=str(error)[:200])
            if ran == 0:
                try:
                    await asyncio.wait_for(stop.wait(), timeout=self._poll_interval)
                except TimeoutError:
                    continue
        self._logger.info("runner stopped")

    async def _run(self, delivery: Delivery, event: Event) -> None:
        consumer = self._by_name.get(delivery.consumer)
        started = time.monotonic()
        try:
            if consumer is None:
                raise PermanentJobError("UNKNOWN_CONSUMER", delivery.consumer)
            with ai_caller(event.user_id, _formation_of(event)):
                await asyncio.wait_for(consumer.run(self._deps, event), timeout=consumer.timeout_s)
        except Exception as error:
            await self._failed(delivery, consumer, error, event)
            return
        async with self._deps.db.service_tx() as tx:
            await outbox.complete(tx, delivery)
        self._logger.info(
            "delivery done",
            job=delivery.consumer,
            attempts=delivery.attempts,
            durationMs=int((time.monotonic() - started) * 1000),
            **event.logging_fields(),
        )

    async def _failed(
        self,
        delivery: Delivery,
        consumer: Consumer | None,
        error: BaseException,
        event: Any = None,
    ) -> None:
        permanent = isinstance(error, PermanentJobError)
        max_attempts = consumer.max_attempts if consumer is not None else 1
        final = permanent or delivery.attempts >= max_attempts
        message = _describe(error)
        async with self._deps.db.service_tx() as tx:
            if final:
                await outbox.fail(tx, delivery, message)
            else:
                delay = outbox.backoff_seconds(delivery.attempts)
                await outbox.reschedule(
                    tx,
                    delivery,
                    run_after=self._deps.clock.now() + timedelta(seconds=delay),
                    error=message,
                )
        fields = {
            "job": delivery.consumer,
            "attempts": delivery.attempts,
            "code": getattr(error, "code", type(error).__name__),
            "eventId": delivery.event_id,
        }
        if final:
            self._logger.error("delivery failed", final=True, error=message, **fields)
            if consumer is not None and consumer.on_final_failure is not None and event is not None:
                try:
                    await consumer.on_final_failure(self._deps, event)
                except Exception as hook_error:
                    self._logger.warning("final failure hook failed", error=_describe(hook_error), **fields)
        else:
            self._logger.warning("delivery failed, will retry", error=message, **fields)

    def _max_lease(self) -> int:
        return max(
            (self.lease_seconds(consumer) for consumer in self._by_name.values()),
            default=LEASE_MARGIN_SECONDS,
        )


def _describe(error: BaseException) -> str:
    if isinstance(error, PermanentJobError):
        return f"{error.code}: {error.detail}"
    if isinstance(error, TimeoutError):
        return "TIMEOUT: the consumer exceeded its timeout"
    return f"{type(error).__name__}: {str(error)[:200]}"


def _formation_of(event: Any) -> str | None:
    """The formation an event belongs to, for the AI journal (ADR-4005)."""
    value = event.data.get("formationId") if hasattr(event.data, "get") else None
    return value if isinstance(value, str) and value else None
