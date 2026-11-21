"""Dependency protocols of the identity use cases (00-conventions section 4).

The use cases only need the injected clock, the settings and a user unit of work. Keeping the
protocols here means a test can pass a small stand-in without building the whole `Deps` bundle, and
`learny.identity.application` never imports the concrete adapters.
"""

from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from learny.identity.domain.actor import Actor
from learny.shared.clock import Clock
from learny.shared.config import Settings


class UserTransactions(Protocol):
    """The unit of work as identity sees it: a transaction under the caller's identity."""

    def user_tx(self, actor: Actor) -> AbstractAsyncContextManager[Any]: ...


class IdentityDeps(Protocol):
    """What the identity use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def settings(self) -> Settings: ...

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> UserTransactions: ...
