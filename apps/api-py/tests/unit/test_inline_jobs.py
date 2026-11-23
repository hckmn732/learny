"""[SPEC-2102] `JOBS_MODE=inline` middleware of the facade (P21 plan, step 6).

The events a request commits run before the answer starts, as with the inline jobs of Hono; the
mode is refused in production and absent otherwise.
"""

from types import SimpleNamespace
from typing import Any, cast

import pytest
from learny.shared.config import Settings
from learny.shared.db import uow
from learny_api.inline_jobs import InlineJobsMiddleware, inline_jobs_options
from starlette.types import Message, Receive, Scope, Send

pytestmark = pytest.mark.spec("SPEC-2102")

SCOPE: Scope = {"type": "http", "method": "POST", "path": "/api/v1/chapters/x/complete"}


class Journal:
    def __init__(self) -> None:
        self.entries: list[tuple[str, Any]] = []

    async def dispatch_events(self, event_ids: list[str]) -> int:
        self.entries.append(("dispatch", list(event_ids)))
        return len(event_ids)

    async def run_events(self, event_ids: list[str]) -> None:
        self.entries.append(("run", list(event_ids)))

    async def send(self, message: Message) -> None:
        self.entries.append(("send", message["type"]))


async def receive() -> Message:
    return {"type": "http.request", "body": b"", "more_body": False}


def answering(*committed: str) -> Any:
    async def app(_scope: Scope, _receive: Receive, send: Send) -> None:
        # What `Database.user_tx` does when the transaction of the request commits.
        uow._committed(cast(Any, SimpleNamespace(events=list(committed))))
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    return app


async def test_the_committed_events_run_before_the_answer() -> None:
    journal = Journal()
    middleware = InlineJobsMiddleware(answering("e-1", "e-2"), cast(Any, journal), cast(Any, journal))

    await middleware(SCOPE, receive, journal.send)

    assert journal.entries == [
        ("dispatch", ["e-1", "e-2"]),
        ("run", ["e-1", "e-2"]),
        ("send", "http.response.start"),
        ("send", "http.response.body"),
    ]


async def test_a_request_without_event_answers_directly() -> None:
    journal = Journal()
    middleware = InlineJobsMiddleware(answering(), cast(Any, journal), cast(Any, journal))

    await middleware(SCOPE, receive, journal.send)

    assert journal.entries == [("send", "http.response.start"), ("send", "http.response.body")]


def test_inline_mode_is_opt_in_and_refused_in_production() -> None:
    ownership = cast(Any, SimpleNamespace(consumers={}, crons={}))
    assert inline_jobs_options(Settings(jobs_mode="worker"), None, ownership) is None
    with pytest.raises(RuntimeError, match="forbidden in production"):
        inline_jobs_options(Settings(jobs_mode="inline", app_env="production"), None, ownership)
