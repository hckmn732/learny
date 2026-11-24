"""Dependency protocols of the engagement use cases (00-conventions section 4).

The use cases need the injected clock, a unit of work (a user transaction under RLS for the reads of
the learner, a service transaction for the notification producer), the logger, and the two delivery
channels. Keeping the protocols here means a test can hand over a memory outbox and a mock push
transport without building the whole `Deps` bundle.
"""

from collections.abc import Mapping
from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from learny.engagement.infrastructure.email import EmailConfig, EmailTransport
from learny.engagement.infrastructure.push import PushTransport
from learny.identity.domain.actor import Actor
from learny.shared.clock import Clock
from learny.shared.config import Settings


class Transactions(Protocol):
    """The unit of work as engagement sees it."""

    def user_tx(self, actor: Actor) -> AbstractAsyncContextManager[Any]: ...

    def service_tx(self) -> AbstractAsyncContextManager[Any]: ...


class ClockPort(Clock, Protocol):
    """The injectable clock (ADR-0047)."""


class EngagementDeps(Protocol):
    """What the engagement use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def settings(self) -> Settings: ...

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> Transactions: ...

    @property
    def logger(self) -> Any: ...

    @property
    def email(self) -> EmailTransport: ...

    @property
    def email_config(self) -> EmailConfig: ...

    @property
    def push(self) -> PushTransport: ...


class NotificationProducer(Protocol):
    """The single entry point the other contexts call (BR-NOT-03)."""

    async def __call__(
        self,
        deps: EngagementDeps,
        *,
        user_id: str,
        notification_type: str,
        data: Mapping[str, Any],
        formation_id: str | None = None,
        dedupe_key: str | None = None,
        **options: Any,
    ) -> Mapping[str, Any]: ...


__all__ = ["ClockPort", "EngagementDeps", "NotificationProducer", "Transactions"]
