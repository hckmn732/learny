"""[SPEC-2102] Inline mode: dedup by event id, retries, permanent failure, depth cap."""

from dataclasses import dataclass, field

import pytest
from learny.shared.outbox.errors import PermanentJobError
from learny.shared.outbox.events import Event
from learny.shared.time import parse_iso
from learny_worker.consumers import Consumer
from learny_worker.inline import MAX_INLINE_DEPTH, MAX_INLINE_EXECUTIONS, dispatch_inline, next_depth
from support.fakes import FakeClock, FakeDatabase, FakeDeps, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2102")

FIXED = parse_iso("2026-11-11T12:20:00Z")


def event(event_id: str = "evt-1", name: str = "sdd/demo-requested") -> Event:
    return Event(event_id=event_id, name=name, data={}, user_id=None, created_at=FIXED)


@dataclass
class Counter:
    runs: int = 0
    errors: list[BaseException] = field(default_factory=list)

    async def run(self, _deps: object, _event: Event) -> None:
        self.runs += 1
        if self.errors:
            raise self.errors.pop(0)


def deps() -> tuple[FakeDeps, RecordingLogger]:
    logger = RecordingLogger()
    return FakeDeps(db=FakeDatabase(), clock=FakeClock(FIXED), logger=logger), logger


def consumer(counter: Counter) -> Consumer:
    return Consumer("devtools.demo_job", on="sdd/demo-requested", run=counter.run)


async def test_runs_the_consumers_of_each_event() -> None:
    counter = Counter()
    deps_under_test, logger = deps()
    await dispatch_inline(deps_under_test, (consumer(counter),), [event()], logger=logger)
    assert counter.runs == 1


async def test_a_replayed_event_runs_once() -> None:
    counter = Counter()
    deps_under_test, logger = deps()
    consumers = (consumer(counter),)
    await dispatch_inline(deps_under_test, consumers, [event(), event()], logger=logger)
    assert counter.runs == 1


async def test_an_event_without_consumer_is_ignored() -> None:
    counter = Counter()
    deps_under_test, logger = deps()
    await dispatch_inline(deps_under_test, (consumer(counter),), [event(name="other/event")], logger=logger)
    assert counter.runs == 0


async def test_a_transient_failure_is_retried_inline() -> None:
    counter = Counter(errors=[RuntimeError("boom"), RuntimeError("boom again")])
    deps_under_test, logger = deps()
    await dispatch_inline(deps_under_test, (consumer(counter),), [event()], logger=logger)
    assert counter.runs == 3
    assert "inline function failed, will retry" in logger.messages()


async def test_the_retries_are_bounded() -> None:
    counter = Counter(errors=[RuntimeError("boom")] * 10)
    deps_under_test, logger = deps()
    await dispatch_inline(deps_under_test, (consumer(counter),), [event()], logger=logger)
    assert counter.runs == MAX_INLINE_EXECUTIONS
    assert logger.messages()[-1] == "inline function failed"


async def test_a_permanent_failure_is_not_retried() -> None:
    counter = Counter(errors=[PermanentJobError("VALIDATION_FAILED", "bad payload")])
    deps_under_test, logger = deps()
    await dispatch_inline(deps_under_test, (consumer(counter),), [event()], logger=logger)
    assert counter.runs == 1
    assert logger.lines[-1][1]["code"] == "VALIDATION_FAILED"


def test_the_depth_is_capped() -> None:
    assert next_depth(0) == 1
    assert next_depth(MAX_INLINE_DEPTH - 1) == MAX_INLINE_DEPTH
    assert next_depth(MAX_INLINE_DEPTH) is None
