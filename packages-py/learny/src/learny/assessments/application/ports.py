"""Dependency protocols of the assessments use cases (00-conventions section 4).

The use cases need the injected clock and a user unit of work (RLS). Keeping the protocols here
means a test can pass a small stand-in without building the whole `Deps` bundle.
"""

from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from learny.identity.domain.actor import Actor
from learny.shared.clock import Clock
from learny.shared.config import Settings


class Transactions(Protocol):
    """The unit of work as the assessments context sees it."""

    def user_tx(self, actor: Actor) -> AbstractAsyncContextManager[Any]: ...


class ClockPort(Clock, Protocol):
    """The injectable clock (ADR-0047)."""


class AssessmentDeps(Protocol):
    """What the assessments use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def settings(self) -> Settings: ...

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> Transactions: ...


__all__ = ["AssessmentDeps", "ClockPort", "Transactions"]
