"""Drain check of the worker before a stop or a restart (SPEC-2301, CL-2).

Stopping the worker is not enough to know the outbox is empty: the dispatcher stamps
`dispatched_at` before it fans out, so an event waiting in the outbox would be picked up by the
next process, later. This command is the written stop criterion of the runbook:

    docker compose exec worker-py python -m learny_worker.drain --wait 60 --require-empty

`--require-empty` exits 1 as soon as an event is still waiting, running, failed or stamped without
delivery; the operator must let the worker catch up (or replay the orphaned events) before stopping
the service. It reads no clock: a fixed number of polls keeps it deterministic (ADR-0047).
"""

import argparse
import asyncio
import json
import math
import sys
from dataclasses import dataclass
from typing import Any

from learny.shared.config import Settings
from learny.shared.deps import Deps, build_deps
from sqlalchemy import text

SNAPSHOT = text(
    """
    select
      (select count(*)::int from public.job_deliveries d
        where d.status = 'running'
          and (cast(:ids as text[]) is null or d.event_id = any(cast(:ids as text[])))) as running,
      (select count(*)::int from public.job_deliveries d
        where d.status = 'pending'
          and (cast(:ids as text[]) is null or d.event_id = any(cast(:ids as text[])))) as pending,
      (select count(*)::int from public.job_deliveries d
        where d.status = 'failed' and d.completed_at > now() - interval '24 hours'
          and (cast(:ids as text[]) is null or d.event_id = any(cast(:ids as text[])))) as failed,
      (select count(*)::int from public.event_outbox o
        where o.dispatched_at is null
          and (cast(:ids as text[]) is null or o.event_id = any(cast(:ids as text[])))) as undispatched,
      (select count(*)::int from public.event_outbox o
        where o.dispatched_at is not null
          and (cast(:ids as text[]) is null or o.event_id = any(cast(:ids as text[])))
          and not exists (select 1 from public.job_deliveries d where d.event_id = o.event_id)
      ) as orphaned
    """
)
POLL_SECONDS = 1.0


@dataclass(frozen=True, slots=True)
class DrainState:
    """One reading of the outbox and of the deliveries."""

    running: int = 0
    pending: int = 0
    failed: int = 0
    undispatched: int = 0
    orphaned: int = 0

    @property
    def in_flight(self) -> int:
        """Deliveries a worker is executing right now."""
        return self.running

    @property
    def empty(self) -> bool:
        """True when nothing is left for Python: the flip loses no event."""
        return self.total() == 0

    def total(self) -> int:
        return self.running + self.pending + self.failed + self.undispatched + self.orphaned

    def as_json(self) -> dict[str, int]:
        return {
            "running": self.running,
            "pending": self.pending,
            "failed": self.failed,
            "undispatched": self.undispatched,
            "orphaned": self.orphaned,
        }


def _state(row: Any) -> DrainState:
    return DrainState(
        running=int(row["running"]),
        pending=int(row["pending"]),
        failed=int(row["failed"]),
        undispatched=int(row["undispatched"]),
        orphaned=int(row["orphaned"]),
    )


async def snapshot(db: Any, event_ids: list[str] | None = None) -> DrainState:
    """Reads the outbox and the deliveries; `event_ids` scopes it to a drill, `None` is global."""
    async with db.service_tx() as tx:
        rows = (await tx.conn.execute(SNAPSHOT, {"ids": event_ids})).mappings().all()
    return _state(rows[0]) if rows else DrainState()


async def wait_for_drain(
    db: Any,
    *,
    attempts: int = 30,
    poll_seconds: float = POLL_SECONDS,
    sleep: Any = asyncio.sleep,
    event_ids: list[str] | None = None,
) -> DrainState:
    """Polls until no delivery runs; returns the last reading (deterministic, no wall clock)."""
    state = await snapshot(db, event_ids)
    for attempt in range(attempts):
        if state.in_flight == 0 or attempt == attempts - 1:
            return state
        await sleep(poll_seconds)
        state = await snapshot(db, event_ids)
    return state


def verdict(state: DrainState, *, require_empty: bool) -> bool:
    """`--require-empty` demands a completely empty queue; otherwise only the in-flight delivery."""
    return state.empty if require_empty else state.in_flight == 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m learny_worker.drain", add_help=True)
    parser.add_argument("--wait", type=int, default=30, metavar="SECONDS")
    parser.add_argument("--poll", type=float, default=POLL_SECONDS, metavar="SECONDS")
    parser.add_argument("--require-empty", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser


async def run(args: argparse.Namespace, deps: Deps | None = None) -> tuple[DrainState, bool]:
    """Reads (or waits for) the drain state and tells whether the flip is safe."""
    resolved = deps or build_deps(Settings())
    attempts = max(1, math.ceil(max(args.wait, 0) / max(args.poll, 0.001)) + 1)
    try:
        state = await wait_for_drain(resolved.db, attempts=attempts, poll_seconds=args.poll)
    finally:
        if deps is None:
            await resolved.db.close()
    return state, verdict(state, require_empty=args.require_empty)


def main(argv: list[str] | None = None) -> int:
    """Entry point: prints one JSON line and exits 0 when the flip is safe, 1 otherwise."""
    args = build_parser().parse_args(argv)
    state, ok = asyncio.run(run(args))
    if args.json:
        print(json.dumps({"state": state.as_json(), "ok": ok}, sort_keys=True))
    else:
        print(
            "drain : "
            f"running={state.running} pending={state.pending} failed={state.failed} "
            f"undispatched={state.undispatched} orphaned={state.orphaned} "
            f"-> {'ok' if ok else 'refused'}"
        )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
