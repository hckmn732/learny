"""`JOBS_MODE=inline` for the tests: a request's events run before its answer (P21 plan, step 6).

This middleware collects the events the request commits and, when the answer starts, hands them to
`learny_worker.inline.run_committed` (same `job_deliveries` rows as the worker). Events committed
once a streamed answer has started are left to the worker. Forbidden in production, like
`resolveJobsMode`.
"""

from typing import Any

from learny.shared.config import Settings
from learny.shared.db.uow import collect_committed_events
from learny_worker.consumers import CONSUMERS
from learny_worker.dispatcher import Dispatcher
from learny_worker.inline import run_committed
from learny_worker.runner import Runner
from starlette.types import ASGIApp, Message, Receive, Scope, Send

INLINE_MODE = "inline"
# It always stays on the worker.
WORKER_ONLY_CONSUMERS = ("privacy.run_data_export",)


class InlineJobsMiddleware:
    """Runs the consumers of the events a request committed before `http.response.start`."""

    def __init__(
        self,
        app: ASGIApp,
        dispatcher: Dispatcher,
        runner: Runner,
        exclude: tuple[str, ...] = (),
    ) -> None:
        self._app = app
        self._dispatcher = dispatcher
        self._runner = runner
        self._exclude = exclude

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        with collect_committed_events() as committed:

            async def send_after_jobs(message: Message) -> None:
                if message["type"] == "http.response.start" and committed:
                    event_ids = list(committed)
                    committed.clear()
                    await run_committed(
                        self._dispatcher,
                        self._runner,
                        event_ids,
                        exclude=self._exclude,
                    )
                await send(message)

            await self._app(scope, receive, send_after_jobs)


def inline_jobs_options(settings: Settings, deps: Any) -> dict[str, Any] | None:
    """The middleware options when `JOBS_MODE=inline`, None otherwise; refused in production."""
    if settings.jobs_mode != INLINE_MODE:
        return None
    if settings.is_production:
        raise RuntimeError("JOBS_MODE=inline is forbidden in production")
    consumers = CONSUMERS
    return {
        "dispatcher": Dispatcher(deps, consumers=consumers),
        "runner": Runner(deps, consumers),
        "exclude": WORKER_ONLY_CONSUMERS,
    }
