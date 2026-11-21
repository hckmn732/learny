"""Consumer registry of the Python worker (SPEC-2102 step 2, ADR-2006).

A consumer is one async function subscribed to one event name. `ownership.yaml` decides which
consumers Python runs: a consumer declared `ts` is never executed here (CA-3), even though it is
listed, so the registry can describe the target state before the flip.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

from learny.shared.clock import Clock
from learny.shared.outbox.errors import PermanentJobError
from learny.shared.outbox.events import Event
from learny.shared.ownership import Owner

DEMO_EVENT = "sdd/demo-requested"
DEMO_CONSUMER = "devtools.demo_job"
FAIL_ONCE_VALUES = ("none", "step-2")

RunConsumer = Callable[[Any, Event], Awaitable[None]]
RunAt = Callable[[Event, Clock], datetime | None]
Validate = Callable[[Event], None]


class Ownership(Protocol):
    """The part of the ownership table the worker reads."""

    @property
    def consumers(self) -> dict[str, Owner]: ...


@dataclass(frozen=True, slots=True)
class Consumer:
    """One consumer of one event; `max_attempts` counts the first attempt."""

    name: str
    on: str
    run: RunConsumer
    timeout_s: int = 300
    max_attempts: int = 4
    run_at: RunAt | None = None
    validate: Validate | None = None
    tags: dict[str, str] = field(default_factory=dict)

    def run_after(self, event: Event, clock: Clock) -> datetime | None:
        """Delayed first execution (replaces Inngest `step.sleepUntil`); None means right now."""
        if self.run_at is None:
            return None
        return self.run_at(event, clock)

    def check(self, event: Event) -> None:
        """Refuses a payload this consumer cannot handle, without retrying it."""
        if self.validate is not None:
            self.validate(event)


def validate_demo_event(event: Event) -> None:
    """The demonstration payload is `{runId: uuid, failOnceAt: 'none' | 'step-2'}`."""
    run_id = event.data.get("runId")
    if not isinstance(run_id, str) or len(run_id) != 36:
        raise PermanentJobError("VALIDATION_FAILED", "runId must be a uuid")
    if event.data.get("failOnceAt") not in FAIL_ONCE_VALUES:
        raise PermanentJobError("VALIDATION_FAILED", "failOnceAt must be 'none' or 'step-2'")


async def demo_job(deps: Any, event: Event) -> None:
    """Demonstration consumer: proves the pipeline on a real flow (step 7 of the plan).

    Its observable effect is the `job_deliveries` row itself (status, attempts, instant): the
    worker marks one delivery per (event, consumer), so a replayed event never runs it twice.
    """
    deps.logger.info(
        "demo job consumed",
        job=DEMO_CONSUMER,
        runId=event.data.get("runId"),
        **event.logging_fields(),
    )


CONSUMERS: tuple[Consumer, ...] = (
    Consumer(
        name=DEMO_CONSUMER,
        on=DEMO_EVENT,
        run=demo_job,
        validate=validate_demo_event,
        tags={"context": "devtools"},
    ),
)


def active_consumers(
    ownership: Ownership,
    registry: tuple[Consumer, ...] = CONSUMERS,
) -> tuple[Consumer, ...]:
    """The consumers Python owns; `ts`-owned ones are described but never run (CA-3)."""
    return tuple(consumer for consumer in registry if ownership.consumers.get(consumer.name) == "py")


def subscribed(consumers: tuple[Consumer, ...], event_name: str) -> tuple[Consumer, ...]:
    return tuple(consumer for consumer in consumers if consumer.on == event_name)
