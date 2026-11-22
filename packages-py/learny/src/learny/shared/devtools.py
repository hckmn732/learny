"""Demonstration pipeline of SPEC-203, executed by the Python worker (SPEC-2207, ADR-2014).

Port of `packages/jobs/src/functions/sdd-demo-pipeline.ts`. The Inngest function recorded three
idempotent steps in `sdd_demo_runs` and failed the second one on its first execution, to show that a
retry replays only that step. The Python worker has no step engine: the demonstration consumer runs
the same sequence in one service transaction, the persisted `attempts` counter carrying the state.
The simulated failure is replayed immediately, because the worker backoff after a first failure is
ten seconds while the demonstration page polls for five; a real delivery failure still goes through
the worker retry and its backoff.

The rows are synthetic demonstration state: `sdd_demo_runs` has no policy for learners, so the
transaction uses the owner role (`learny.shared.db.privileged`, SPEC-2101 EF-4).
"""

import json
from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy import text

from learny.shared.time import to_iso

SDD_DEMO_STEPS: tuple[str, str, str] = ("step-1-prepare", "step-2-process", "step-3-finish")
"""The three stable step names of the pipeline (never derived from user values, ET-5)."""

SIMULATED_FAILURE_STEP = "step-2"
"""The step the demonstration switch (`failOnceAt: 'step-2'`) fails once."""

INSERT_RUN = text(
    "insert into public.sdd_demo_runs (run_id) values (cast(:run_id as uuid)) on conflict (run_id) do nothing"
)
LOCK_RUN = text(
    "select attempts, steps, finished_at from public.sdd_demo_runs "
    "where run_id = cast(:run_id as uuid) for update"
)
RECORD_STEP = text(
    "update public.sdd_demo_runs set steps = case when steps @> cast(:marker as jsonb) "
    "then steps else steps || cast(:entry as jsonb) end where run_id = cast(:run_id as uuid)"
)
SET_ATTEMPTS = text(
    "update public.sdd_demo_runs set attempts = cast(:attempts as integer) "
    "where run_id = cast(:run_id as uuid)"
)
FINISH_RUN = text(
    "update public.sdd_demo_runs set finished_at = cast(:at as timestamptz) "
    "where run_id = cast(:run_id as uuid)"
)


class DemoPipelineDeps(Protocol):
    """What the demonstration pipeline needs; `learny.shared.deps.Deps` satisfies it."""

    @property
    def clock(self) -> Any: ...

    @property
    def db(self) -> Any: ...

    @property
    def logger(self) -> Any: ...


@dataclass(frozen=True, slots=True)
class DemoRun:
    """The observable state of one run, as the demonstration page reads it."""

    run_id: str
    steps: tuple[str, ...]
    attempts: int
    skipped: bool = False


def step_marker(name: str) -> str:
    """The JSON array the `@>` containment test looks for (`[{name}]`)."""
    return json.dumps([{"name": name}], separators=(",", ":"))


def step_entry(name: str, at: str) -> str:
    """The JSON array appended by `recordStep` (`[{name, at}]`)."""
    return json.dumps([{"name": name, "at": at}], separators=(",", ":"))


def step_names(steps: Any) -> tuple[str, ...]:
    """The recorded step names of a stored `steps` column, in their insertion order."""
    if not isinstance(steps, list):
        return ()
    return tuple(
        str(entry["name"])
        for entry in steps
        if isinstance(entry, dict) and isinstance(entry.get("name"), str)
    )


async def run_demo_pipeline(
    deps: DemoPipelineDeps,
    run_id: str,
    fail_once_at: str,
) -> DemoRun:
    """Records the three steps of one run; a finished run is left untouched (idempotent, ET-1)."""
    now = to_iso(deps.clock.now())
    async with deps.db.service_tx() as tx:
        await tx.conn.execute(INSERT_RUN, {"run_id": run_id})
        row = (await tx.conn.execute(LOCK_RUN, {"run_id": run_id})).mappings().first()
        attempts = 0 if row is None else int(row["attempts"])
        if row is not None and row["finished_at"] is not None:
            deps.logger.info("demo run already finished", runId=run_id, attempts=attempts)
            return DemoRun(
                run_id=run_id,
                steps=step_names(row["steps"]),
                attempts=attempts,
                skipped=True,
            )

        async def record(name: str) -> None:
            await tx.conn.execute(
                RECORD_STEP,
                {"run_id": run_id, "marker": step_marker(name), "entry": step_entry(name, now)},
            )

        await record(SDD_DEMO_STEPS[0])
        attempts += 1
        await tx.conn.execute(SET_ATTEMPTS, {"run_id": run_id, "attempts": attempts})
        if fail_once_at == SIMULATED_FAILURE_STEP and attempts == 1:
            deps.logger.warning(
                "demo step failed once",
                runId=run_id,
                step=SIMULATED_FAILURE_STEP,
                attempts=attempts,
            )
            attempts += 1
            await tx.conn.execute(SET_ATTEMPTS, {"run_id": run_id, "attempts": attempts})
        await record(SDD_DEMO_STEPS[1])
        await record(SDD_DEMO_STEPS[2])
        await tx.conn.execute(FINISH_RUN, {"at": now, "run_id": run_id})

    deps.logger.info("demo run finished", runId=run_id, attempts=attempts)
    return DemoRun(run_id=run_id, steps=SDD_DEMO_STEPS, attempts=attempts)


__all__ = [
    "FINISH_RUN",
    "INSERT_RUN",
    "LOCK_RUN",
    "RECORD_STEP",
    "SDD_DEMO_STEPS",
    "SET_ATTEMPTS",
    "SIMULATED_FAILURE_STEP",
    "DemoPipelineDeps",
    "DemoRun",
    "run_demo_pipeline",
    "step_entry",
    "step_marker",
    "step_names",
]
