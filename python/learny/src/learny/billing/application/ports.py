"""Dependency protocols of the billing use cases (00-conventions section 4)."""

from contextlib import AbstractAsyncContextManager
from typing import Any, Protocol

from learny.platform.stripe import StripeGateway, WebhookJournal
from learny.shared.clock import Clock
from learny.shared.config import Settings


class BillingTransactions(Protocol):
    def service_tx(self) -> AbstractAsyncContextManager[Any]:
        """The unit of work as billing sees it: the owner-role transaction."""
        ...


class BillingDeps(Protocol):
    """What the billing use cases need; `learny.shared.deps.Deps` satisfies it."""

    @property
    def settings(self) -> Settings: ...

    @property
    def clock(self) -> Clock: ...

    @property
    def db(self) -> BillingTransactions: ...

    @property
    def stripe(self) -> StripeGateway: ...

    @property
    def webhook_journal(self) -> WebhookJournal | None: ...

    @property
    def logger(self) -> Any: ...
