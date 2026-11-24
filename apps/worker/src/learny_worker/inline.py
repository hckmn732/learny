"""Inline execution of the Python consumers (SPEC-2102 step 6).

With `JOBS_MODE=inline` an emitted event does not wait for the worker, the consumers Python owns run
in the API process, the delays are ignored, a failing consumer is retried up to four executions and
the depth of the events produced by a consumer is capped at five. Errors are logged and never reach
the emitter.

The bridge to the `ts`-owned consumers of P21 is removed by SPEC-2207: every consumer of the table
is `py`, so nothing is relayed any more.

`run_committed` is what the API calls after a request committed its events (P21 plan, step 6): the
events go through the same `job_deliveries` rows as with the worker (one delivery per consumer,
`done` or `failed`), they are only executed before the answer instead of on the next poll.
"""

import asyncio
from collections.abc import Iterable
from typing import Any

import structlog
from learny.platform.llm.caller import ai_caller
from learny.shared.db.uow import collect_committed_events
from learny.shared.outbox.errors import PermanentJobError
from learny.shared.outbox.events import Event

from learny_worker.consumers import Consumer
from learny_worker.dispatcher import Dispatcher
from learny_worker.runner import Runner

MAX_INLINE_DEPTH = 5
MAX_INLINE_EXECUTIONS = 4
SEEN_LIMIT = 10_000


async def dispatch_inline(
    deps: Any,
    consumers: tuple[Consumer, ...],
    events: Iterable[Event],
    *,
    depth: int = 0,
    seen: set[str] | None = None,
    logger: Any = None,
) -> None:
    """Runs the Python consumers subscribed to `events`, depth first, once per event identifier."""
    log = logger or structlog.get_logger("learny.worker.inline")
    executed = seen if seen is not None else set()
    for event in events:
        if event.event_id in executed:
            continue
        executed.add(event.event_id)
        if len(executed) > SEEN_LIMIT:
            executed.discard(next(iter(executed)))
        for consumer in consumers:
            if consumer.on != event.name:
                continue
            await _execute(deps, consumer, event, depth, log)


async def _execute(
    deps: Any,
    consumer: Consumer,
    event: Event,
    depth: int,
    log: Any,
) -> None:
    for execution in range(1, MAX_INLINE_EXECUTIONS + 1):
        try:
            with ai_caller(event.user_id, _formation_of(event)):
                await consumer.run(deps, event)
            return
        except PermanentJobError as error:
            log.error(
                "inline function failed",
                job=consumer.name,
                code=error.code,
                executions=execution,
                **event.logging_fields(),
            )
            return
        except Exception as error:
            if execution == MAX_INLINE_EXECUTIONS:
                log.error(
                    "inline function failed",
                    job=consumer.name,
                    code=type(error).__name__,
                    executions=execution,
                    **event.logging_fields(),
                )
                return
            log.warning(
                "inline function failed, will retry",
                job=consumer.name,
                code=type(error).__name__,
                executions=execution,
                **event.logging_fields(),
            )
            await asyncio.sleep(0)
    del depth


async def run_committed(
    dispatcher: Dispatcher,
    runner: Runner,
    event_ids: list[str],
    *,
    depth: int = 0,
    exclude: tuple[str, ...] = (),
    logger: Any = None,
) -> None:
    """Fans out and runs the committed events, then the events their consumers commit, depth first.

    Never raises: the emitter already committed, a failure stays on its delivery and in the logs.
    """
    log = logger or structlog.get_logger("learny.worker.inline")
    if not event_ids:
        return
    try:
        with collect_committed_events() as produced:
            await dispatcher.dispatch_events(event_ids)
            await runner.run_events(event_ids, exclude=exclude)
    except Exception as error:
        log.error("inline dispatch failed", code=type(error).__name__, error=str(error)[:200])
        return
    if not produced:
        return
    following = next_depth(depth)
    if following is None:
        log.error("inline dispatch depth exceeded", outcome="inline_depth_exceeded")
        return
    await run_committed(dispatcher, runner, produced, depth=following, exclude=exclude, logger=log)


def next_depth(depth: int) -> int | None:
    """The depth of the events produced by a consumer, or None when the cap is reached."""
    candidate = depth + 1
    return candidate if candidate <= MAX_INLINE_DEPTH else None


def _formation_of(event: Any) -> str | None:
    """The formation an event belongs to, for the AI journal (ADR-4005)."""
    value = event.data.get("formationId") if hasattr(event.data, "get") else None
    return value if isinstance(value, str) and value else None
