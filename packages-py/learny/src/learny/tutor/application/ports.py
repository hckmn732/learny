"""Dependency protocols of the tutor use cases (00-conventions section 4).

The use cases need the injected clock, a user or service unit of work, the AI gateway and the
logger. Keeping the protocols here means a test can pass a small stand-in without building the whole
`Deps` bundle.
"""

from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from learny.identity.domain.actor import Actor
from learny.platform.llm.gateway import LlmGateway
from learny.shared.clock import Clock


class Transactions(Protocol):
    """The unit of work as the tutor context sees it."""

    def user_tx(self, actor: Actor) -> AbstractAsyncContextManager[Any]: ...

    def service_tx(self) -> AbstractAsyncContextManager[Any]: ...


class TutorDeps(Protocol):
    """What the tutor use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> Transactions: ...

    @property
    def llm(self) -> LlmGateway: ...

    @property
    def logger(self) -> Any: ...
