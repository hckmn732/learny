"""Dependency protocols of the content use cases (00-conventions section 4).

The use cases need the injected clock, a user or service unit of work, the storage gateway and the
logger. Keeping the protocols here means a test can pass a small stand-in without building the whole
`Deps` bundle.
"""

from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from learny.identity.domain.actor import Actor
from learny.platform.storage import StorageAccess, StorageGateway
from learny.shared.clock import Clock
from learny.shared.config import Settings


class Transactions(Protocol):
    """The unit of work as the content context sees it."""

    def user_tx(self, actor: Actor) -> AbstractAsyncContextManager[Any]: ...

    def service_tx(self) -> AbstractAsyncContextManager[Any]: ...


class ContentDeps(Protocol):
    """What the content use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def settings(self) -> Settings: ...

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> Transactions: ...

    @property
    def storage(self) -> StorageGateway: ...

    @property
    def logger(self) -> Any: ...

    @property
    def llm(self) -> Any: ...


def storage_access(deps: ContentDeps, user_id: str, *, service: bool = False) -> StorageAccess:
    """The short-lived Storage token minted for one caller (SPEC-114, never logged)."""
    from learny.platform.storage import mint_user_access_token

    return StorageAccess(
        user_id=user_id,
        access_token=mint_user_access_token(user_id, deps.settings.supabase_jwt_secret),
        role="service" if service else "user",
    )
