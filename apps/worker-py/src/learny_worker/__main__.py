"""`python -m learny_worker`, the durable worker of Learny (SPEC-2102, ADR-2006).

One process runs four loops: the outbox dispatcher, the delivery runner, the singleton scheduler and
an optional health server. `SIGTERM` and `SIGINT` stop the claiming at once and let the in-flight
deliveries finish (at most 30 s), so a deployment never loses a delivery: an abandoned lease is
claimed again once it expires (ET-1, CL-1).
"""

import asyncio
import contextlib
import signal
from typing import Any

import structlog
import uvicorn
from learny.shared.config import Settings
from learny.shared.deps import Deps, build_deps
from learny.shared.ownership import Ownership, load_ownership_for_worker

from learny_worker.consumers import active_consumers
from learny_worker.dispatcher import Dispatcher
from learny_worker.health import create_health_app
from learny_worker.runner import Runner
from learny_worker.scheduler import Scheduler

STOP_TIMEOUT_SECONDS = 45


def build(settings: Settings, ownership: Ownership, deps: Deps | None = None) -> dict[str, Any]:
    """Builds the loops; exposed so the integration tests can drive them without a process."""
    resolved = deps or build_deps(settings)
    consumers = active_consumers(ownership)
    return {
        "deps": resolved,
        "consumers": consumers,
        "dispatcher": Dispatcher(
            resolved,
            ownership,
            interval_ms=settings.py_dispatch_interval_ms,
            batch_size=settings.py_dispatch_batch_size,
            consumers=consumers,
        ),
        "runner": Runner(
            resolved,
            consumers,
            concurrency=settings.py_worker_concurrency,
            poll_interval_ms=settings.py_worker_poll_interval_ms,
        ),
        "scheduler": Scheduler(
            resolved,
            ownership,
            retry_interval_s=settings.py_scheduler_retry_interval_s,
            poll_interval_s=settings.py_scheduler_poll_interval_s,
        ),
    }


async def serve(settings: Settings, loops: dict[str, Any]) -> None:
    """Runs the loops until the stop event is set (the signal handler sets it)."""
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)
    logger = structlog.get_logger("learny.worker")
    logger.info(
        "worker started",
        consumers=[consumer.name for consumer in loops["consumers"]],
        concurrency=settings.py_worker_concurrency,
    )
    server = _health_server(settings, loops["deps"])
    tasks = [
        asyncio.create_task(loops["dispatcher"].run(stop), name="dispatcher"),
        asyncio.create_task(loops["runner"].run(stop), name="runner"),
        asyncio.create_task(loops["scheduler"].run(stop), name="scheduler"),
    ]
    if server is not None:
        tasks.append(asyncio.create_task(server.serve(), name="health"))
    await stop.wait()
    logger.info("worker stopping")
    if server is not None:
        server.should_exit = True
    for task in tasks:
        if task.get_name() == "health":
            task.cancel()
    done, pending = await asyncio.wait(tasks, timeout=STOP_TIMEOUT_SECONDS)
    for task in pending:
        task.cancel()
    if pending:
        logger.warning("worker stop timeout", abandoned=len(pending))
    del done


def _health_server(settings: Settings, deps: Deps) -> uvicorn.Server | None:
    if settings.py_worker_health_port <= 0:
        return None
    config = uvicorn.Config(
        create_health_app(deps),
        host="127.0.0.1",
        port=settings.py_worker_health_port,
        log_level="warning",
        access_log=False,
    )
    return uvicorn.Server(config)


async def run(settings: Settings) -> None:
    """Builds the dependencies, runs the loops, and closes the pool on the way out."""
    deps = build_deps(settings)
    try:
        ownership = load_ownership_for_worker()
        await serve(settings, build(settings, ownership, deps))
    finally:
        await deps.db.close()


def main() -> int:
    """Entry point of the worker process."""
    settings = Settings()
    if settings.jobs_mode != "worker":
        structlog.get_logger("learny.worker").warning(
            "worker not started: the jobs mode runs the consumers elsewhere",
            jobsMode=settings.jobs_mode,
        )
        return 0
    try:
        asyncio.run(run(settings))
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
