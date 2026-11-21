"""Dependency protocols of the learning use cases (00-conventions section 4).

The use cases need the injected clock, a user unit of work (RLS) and the brick reference resolver
used by the assessment services. Keeping the protocols here means a test can pass a small stand-in
without building the whole `Deps` bundle.
"""

from collections.abc import Mapping, Sequence
from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from learny.identity.domain.actor import Actor
from learny.shared.clock import Clock
from learny.shared.config import Settings


class Transactions(Protocol):
    """The unit of work as learning sees it."""

    def user_tx(self, actor: Actor) -> AbstractAsyncContextManager[Any]: ...

    def service_tx(self) -> AbstractAsyncContextManager[Any]: ...


class ClockPort(Clock, Protocol):
    """The injectable clock (ADR-0047)."""


class BrickReferenceResolver(Protocol):
    """Resolves the notions, modules and chapters a brick may point at, inside the caller's tx."""

    async def resolve(self, tx: Any, refs: Sequence[Mapping[str, Any]], owner_id: str) -> Mapping[str, Any]:
        """The referenced entities that exist and are readable, keyed by identifier."""
        ...


class LearningDeps(Protocol):
    """What the learning use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def settings(self) -> Settings: ...

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> Transactions: ...
