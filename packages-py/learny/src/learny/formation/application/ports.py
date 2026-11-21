"""Dependency protocols of the formation use cases (00-conventions section 4).

The use cases need the injected clock, the settings, a user unit of work, a service unit of work
(groups and outbox metadata are read with the owner role) and the `LlmGateway`. Keeping the
protocols here means a test can pass a small stand-in without building the whole `Deps` bundle.
"""

from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from learny.identity.domain.actor import Actor
from learny.platform.llm.gateway import LlmGateway
from learny.shared.clock import Clock
from learny.shared.config import Settings


class Transactions(Protocol):
    """The unit of work as formation sees it."""

    def user_tx(self, actor: Actor) -> AbstractAsyncContextManager[Any]: ...

    def service_tx(self) -> AbstractAsyncContextManager[Any]: ...


class FormationDeps(Protocol):
    """What the formation use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def settings(self) -> Settings: ...

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> Transactions: ...

    @property
    def llm(self) -> LlmGateway: ...
