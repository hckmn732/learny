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
from learny.shared.config import Settings, load_settings
from learny.shared.deps import Deps, build_deps

from learny_worker.consumers import CONSUMERS
from learny_worker.dispatcher import Dispatcher
from learny_worker.health import create_health_app
from learny_worker.runner import Runner
from learny_worker.scheduler import Scheduler

STOP_TIMEOUT_SECONDS = 45
# Tuning of the loops (ADR-2042): constants of the code, identical in every environment.
DISPATCH_INTERVAL_MS = 500
DISPATCH_BATCH_SIZE = 100
WORKER_CONCURRENCY = 8
WORKER_POLL_INTERVAL_MS = 500
SCHEDULER_RETRY_INTERVAL_S = 15
SCHEDULER_POLL_INTERVAL_S = 20


def build(settings: Settings, deps: Deps | None = None) -> dict[str, Any]:
    """Builds the loops; exposed so the integration tests can drive them without a process."""
    resolved = deps or build_deps(settings)
    consumers = CONSUMERS
    return {
        "deps": resolved,
        "consumers": consumers,
        "dispatcher": Dispatcher(
            resolved,
            interval_ms=DISPATCH_INTERVAL_MS,
            batch_size=DISPATCH_BATCH_SIZE,
            consumers=consumers,
        ),
        "runner": Runner(
            resolved,
            consumers,
            concurrency=WORKER_CONCURRENCY,
            poll_interval_ms=WORKER_POLL_INTERVAL_MS,
        ),
        "scheduler": Scheduler(
            resolved,
            retry_interval_s=SCHEDULER_RETRY_INTERVAL_S,
            poll_interval_s=SCHEDULER_POLL_INTERVAL_S,
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
        concurrency=WORKER_CONCURRENCY,
    )
    await loops["runner"].release_interrupted()
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
    """The health server listens on the standard `PORT` when the deployment sets one."""
    if settings.port <= 0:
        return None
    config = uvicorn.Config(
        create_health_app(deps),
        host="127.0.0.1",
        port=settings.port,
        log_level="warning",
        access_log=False,
    )
    return uvicorn.Server(config)


async def run(settings: Settings) -> None:
    """Builds the dependencies, runs the loops, and closes the pool on the way out."""
    deps = build_deps(settings)
    try:
        await serve(settings, build(settings, deps))
    finally:
        await deps.db.close()


def main() -> int:
    """Entry point of the worker process."""
    settings = load_settings()
    try:
        asyncio.run(run(settings))
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
