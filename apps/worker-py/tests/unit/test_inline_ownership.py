"""[SPEC-2207] Inline mode after the flip: only Python consumers run, nothing is relayed."""

import inspect
from typing import Any

import pytest
from learny.shared.outbox.events import Event
from learny.shared.ownership import Owner
from learny.shared.time import parse_iso
from learny_worker.consumers import CONSUMERS, Consumer, active_consumers
from learny_worker.inline import dispatch_inline
from support.fakes import FakeClock, FakeDatabase, FakeDeps, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2207")

FIXED = parse_iso("2026-11-11T12:20:00Z")
EVENT = Event(event_id="evt-1", name="quiz/submitted", data={}, user_id=None, created_at=FIXED)


class FakeOwnership:
    def __init__(self, consumers: dict[str, Owner]) -> None:
        self.consumers = consumers


class Counter:
    def __init__(self) -> None:
        self.runs = 0

    async def run(self, _deps: Any, _event: Event) -> None:
        self.runs += 1


def deps() -> tuple[FakeDeps, RecordingLogger]:
    logger = RecordingLogger()
    return FakeDeps(db=FakeDatabase(), clock=FakeClock(FIXED), logger=logger), logger


def test_the_inline_dispatcher_no_longer_carries_a_bridge() -> None:
    # P21 step 6 relayed the events of a `ts`-owned consumer to the Hono dispatch route; SPEC-2207
    # removes the bridge, so no `send` hook is left in the signature.
    assert "send" not in inspect.signature(dispatch_inline).parameters


async def test_inline_dispatch_runs_only_the_python_owned_consumers() -> None:
    counter = Counter()
    consumer = Consumer("assessments.grade_quiz", on=EVENT.name, run=counter.run)
    ownership = FakeOwnership({consumer.name: "py"})
    deps_under_test, logger = deps()

    await dispatch_inline(deps_under_test, active_consumers(ownership, (consumer,)), [EVENT], logger=logger)
    assert counter.runs == 1


async def test_inline_dispatch_never_runs_a_typescript_owned_consumer() -> None:
    counter = Counter()
    consumer = Consumer("assessments.grade_quiz", on=EVENT.name, run=counter.run)
    ownership = FakeOwnership({consumer.name: "ts"})
    deps_under_test, logger = deps()

    await dispatch_inline(deps_under_test, active_consumers(ownership, (consumer,)), [EVENT], logger=logger)
    assert counter.runs == 0


def test_every_registry_consumer_is_python_owned_in_the_real_table() -> None:
    from pathlib import Path

    from learny.shared.ownership import load_ownership

    ownership = load_ownership(Path(__file__).resolve().parents[4] / "api" / "ownership.yaml")
    assert active_consumers(ownership) == CONSUMERS
