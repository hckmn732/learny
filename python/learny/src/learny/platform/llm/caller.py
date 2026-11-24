"""Who an AI call is made for (ADR-4005).

The live gateway resolves the learner's own model and key (BYOK, BR-IA-01) and journals every call
under the learner (BR-IA-08). The use cases do not thread a user identifier down to every prompt:
the two entry points bind the caller once, the API pipeline for an authenticated request and the
worker for an outbox event, exactly like `collect_committed_events` binds the committed events of a
transaction. A call made where no caller is bound fails with `AI_UNAVAILABLE` instead of guessing.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AiCaller:
    """The learner an AI call runs for, and the formation it belongs to when known."""

    user_id: str
    formation_id: str | None = None


_CALLER: ContextVar[AiCaller | None] = ContextVar("learny_ai_caller", default=None)


@contextmanager
def ai_caller(user_id: str | None, formation_id: str | None = None) -> Iterator[AiCaller | None]:
    """Binds the caller for the calls made inside; a missing user binds nothing."""
    caller = None if not user_id else AiCaller(user_id=user_id, formation_id=formation_id or None)
    token = _CALLER.set(caller)
    try:
        yield caller
    finally:
        _CALLER.reset(token)


def current_caller() -> AiCaller | None:
    """The caller bound by the innermost `ai_caller`, if any."""
    return _CALLER.get()
