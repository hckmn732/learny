"""Dependency protocols of the privacy use cases (00-conventions section 4).

The account page reads under the learner's RLS (`user_tx`); the creation, the deletion schedule and
the jobs act with the owner role (`service_tx`). Storage and e-mail stay explicit ports, so the
integration suite never touches Supabase Storage nor a real mail transport (ET-7).
"""

from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from learny.engagement.infrastructure.email import EmailConfig, EmailTransport
from learny.identity.domain.actor import Actor
from learny.platform.storage import StorageBucket
from learny.shared.clock import Clock
from learny.shared.config import Settings


class PrivacyTransactions(Protocol):
    """Both transactions the context needs: the learner's RLS one and the job one."""

    def user_tx(self, actor: Actor) -> AbstractAsyncContextManager[Any]: ...

    def service_tx(self) -> AbstractAsyncContextManager[Any]: ...


class ExportStorage(Protocol):
    """Read-URL signing of the private `exports` bucket; `SupabaseStorage` satisfies it."""

    async def sign_read(
        self, bucket: StorageBucket, path: str, access_token: str, expires_in_seconds: int
    ) -> str: ...


class PrivacyDeps(Protocol):
    """What the privacy use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def settings(self) -> Settings: ...

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> PrivacyTransactions: ...

    @property
    def storage(self) -> ExportStorage: ...

    @property
    def email_config(self) -> EmailConfig: ...

    @property
    def email(self) -> EmailTransport: ...

    @property
    def logger(self) -> Any: ...
