"""[SPEC-2301] Local rollback drill of the cutover: drain, flip, replay, exactly once (CL-2).

The rollback hands a context back to `ts`. Two things can go wrong and are proven here:

- flipping while the worker still holds deliveries strands nothing only if the queue was drained;
  the drain check refuses a queue with a pending, undispatched or delivery-less event;
- replaying the same event after the flip runs the consumer once: the delivery is unique per
  (event, consumer) and the demonstration pipeline leaves a finished run untouched.

Events and demonstration runs created here are deleted afterwards. Nothing is presented as a
staging measurement (ADR-2009): this is the local proof, on the shared local database.
"""

import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from learny.shared.clock import Clock
from learny.shared.db.uow import Database
from learny.shared.ownership import Ownership, apply_overrides, load_ownership
from learny.shared.time import parse_iso
from learny_worker import drain
from learny_worker.consumers import active_consumers
from learny_worker.dispatcher import Dispatcher
from learny_worker.runner import Runner
from sqlalchemy import text
from support.fakes import FakeClock, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2301")

FIXED = parse_iso("2026-11-11T12:20:00Z")
DEMO_EVENT = "sdd/demo-requested"
DEMO_CONSUMER = "devtools.demo_job"
STEPS = ["step-1-prepare", "step-2-process", "step-3-finish"]
OWNERSHIP_FILE = __import__("pathlib").Path(__file__).resolve().parents[4] / "api" / "ownership.yaml"


class Deps:
    """The three capabilities the dispatcher, the runner and the demonstration pipeline read."""

    def __init__(self, database: Database) -> None:
        self.db = database
        self.clock: Clock = FakeClock(FIXED)
        self.logger = RecordingLogger()


def ownership() -> Ownership:
    return load_ownership(OWNERSHIP_FILE)


def py_ownership() -> Ownership:
    return ownership()


def ts_ownership() -> Ownership:
    """The rollback target: the demonstration consumer goes back to Inngest."""
    return apply_overrides(ownership(), {DEMO_CONSUMER: "ts"})


@pytest.fixture
async def events(database: Database) -> AsyncIterator[list[str]]:
    """Event identifiers of the drill, deleted with their deliveries and demonstration runs."""
    created: list[str] = []
    yield created
    async with database.service_tx() as tx:
        for event_id in created:
            rows = (
                (
                    await tx.conn.execute(
                        text("select data->>'runId' as run_id from public.event_outbox where event_id = :id"),
                        {"id": event_id},
                    )
                )
                .mappings()
                .all()
            )
            for row in rows:
                if row["run_id"] is not None:
                    await tx.conn.execute(
                        text("delete from public.sdd_demo_runs where run_id = cast(:run as uuid)"),
                        {"run": row["run_id"]},
                    )
            await tx.conn.execute(
                text("delete from public.event_outbox where event_id = :id"), {"id": event_id}
            )


async def emit(database: Database, created: list[str]) -> tuple[str, str]:
    """Writes one demonstration event and returns (event id, run id)."""
    event_id = f"spec-2301:{uuid.uuid4()}"
    run_id = str(uuid.uuid4())
    async with database.service_tx() as tx:
        await tx.emit(DEMO_EVENT, {"runId": run_id, "failOnceAt": "none"}, event_id=event_id)
    created.append(event_id)
    return event_id, run_id


async def delivery(database: Database, event_id: str) -> dict[str, Any]:
    async with database.service_tx() as tx:
        rows = (
            (
                await tx.conn.execute(
                    text(
                        "select status, attempts from public.job_deliveries"
                        " where event_id = :id and consumer = :consumer"
                    ),
                    {"id": event_id, "consumer": DEMO_CONSUMER},
                )
            )
            .mappings()
            .all()
        )
    return dict(rows[0]) if rows else {}


async def demo_run(database: Database, run_id: str) -> dict[str, Any]:
    async with database.service_tx() as tx:
        rows = (
            (
                await tx.conn.execute(
                    text(
                        "select attempts, finished_at, jsonb_array_length(steps) as steps"
                        " from public.sdd_demo_runs where run_id = cast(:run as uuid)"
                    ),
                    {"run": run_id},
                )
            )
            .mappings()
            .all()
        )
    return dict(rows[0]) if rows else {}


def dispatcher(database: Database, table: Ownership) -> Dispatcher:
    return Dispatcher(Deps(database), table, consumers=active_consumers(table))


def runner(database: Database, table: Ownership) -> Runner:
    return Runner(Deps(database), active_consumers(table))


async def test_the_drain_refuses_a_pending_delivery_and_accepts_an_empty_queue(
    events: list[str], database: Database
) -> None:
    event_id, _run_id = await emit(database, events)
    assert await dispatcher(database, py_ownership()).dispatch_once() >= 1

    waiting = await drain.snapshot(database, [event_id])
    assert waiting.pending == 1
    assert waiting.in_flight == 0
    assert not drain.verdict(waiting, require_empty=True)
    # Sans `--require-empty`, seule une livraison en cours bloque la bascule.
    assert drain.verdict(waiting, require_empty=False)

    assert await runner(database, py_ownership()).run_once() >= 1
    drained = await drain.wait_for_drain(database, attempts=1, event_ids=[event_id])
    assert drained.empty
    assert drain.verdict(drained, require_empty=True)


async def test_rollback_after_drain_loses_no_event_and_runs_it_once(
    events: list[str], database: Database
) -> None:
    event_id, run_id = await emit(database, events)

    # 1. Le worker Python répartit l'événement : une livraison, encore en attente.
    assert await dispatcher(database, py_ownership()).dispatch_once() >= 1
    assert (await delivery(database, event_id))["status"] == "pending"

    # 2. Bascule vers ts (surcharge de propriété) : Python ne réclame plus le consommateur.
    rolled_back = ts_ownership()
    assert rolled_back.consumers[DEMO_CONSUMER] == "ts"
    assert await dispatcher(database, rolled_back).dispatch_once() == 0

    # 3. Le lot en cours se termine : c'est le seul effet, et l'outbox se vide.
    assert await runner(database, py_ownership()).run_once() >= 1
    row = await delivery(database, event_id)
    assert row == {"status": "done", "attempts": 1}
    run = await demo_run(database, run_id)
    assert run["steps"] == len(STEPS)
    assert run["attempts"] == 1
    assert run["finished_at"] is not None
    drained = await drain.snapshot(database, [event_id])
    assert drained.empty

    # 4. Retour à py : rejouer l'événement ne crée rien et ne mute rien deux fois.
    assert await dispatcher(database, py_ownership()).dispatch_once() == 0
    assert await runner(database, py_ownership()).run_once() == 0
    assert (await delivery(database, event_id))["attempts"] == 1
    assert (await demo_run(database, run_id))["attempts"] == 1
    assert (await demo_run(database, run_id))["steps"] == len(STEPS)


async def test_flipping_before_the_drain_would_strand_an_event(events: list[str], database: Database) -> None:
    # Le consommateur est déjà chez TypeScript : l'événement est estampillé sans livraison.
    event_id, _run_id = await emit(database, events)
    assert await dispatcher(database, ts_ownership()).dispatch_once() == 0
    stranded = await drain.snapshot(database, [event_id])
    assert stranded.undispatched == 0
    assert stranded.orphaned == 1
    assert not drain.verdict(stranded, require_empty=True)

    # Reprise documentée : remettre l'événement en file, puis le laisser au worker Python.
    async with database.service_tx() as tx:
        await tx.conn.execute(
            text("update public.event_outbox set dispatched_at = null where event_id = :id"),
            {"id": event_id},
        )
    assert await dispatcher(database, py_ownership()).dispatch_once() == 1
    assert await runner(database, py_ownership()).run_once() == 1
    assert (await delivery(database, event_id))["status"] == "done"
    healed = await drain.snapshot(database, [event_id])
    assert healed.empty


async def test_an_event_carries_no_python_delivery_when_the_consumer_is_ts(
    events: list[str], database: Database
) -> None:
    # Preuve de la règle « un seul écrivain » côté jobs (ADR-2005, CA-3) : Python ne réclame
    # jamais un consommateur `ts`, et le relais Inngest reste seul à l'exécuter.
    event_id, _run_id = await emit(database, events)
    assert await dispatcher(database, ts_ownership()).dispatch_once() == 0
    assert await delivery(database, event_id) == {}
    # L'événement existe pourtant, non perdu côté base : c'est le drain qui le signale.
    async with database.service_tx() as tx:
        rows = (
            (
                await tx.conn.execute(
                    text("select dispatched_at from public.event_outbox where event_id = :id"),
                    {"id": event_id},
                )
            )
            .mappings()
            .all()
        )
    assert rows
    assert rows[0]["dispatched_at"] is not None
