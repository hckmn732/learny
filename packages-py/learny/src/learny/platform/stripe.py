"""Stripe capability of the backend (SPEC-2206, port of `packages/services/src/billing`).

Two gateways behind one protocol: `StripeSdkGateway` talks to Stripe (server-side key only, never
returned to the browser) and `MockStripeGateway` is the deterministic simulation selected by
`STRIPE_MODE=mock`; no test ever reaches the network. Identifiers are numbered (`cus_mock_1`,
`sub_mock_1`, `cs_mock_1`, `evt_mock_1`), time comes from the injected clock, and webhooks are signed
with the scheme Stripe documents.

The signature check uses `learny.billing.domain.webhook.verify_signature`, not the SDK's
`Webhook.construct_event`: the SDK reads the process clock for the 300 s tolerance, which ADR-0047
forbids, so the documented scheme is ported with an injected clock (ADR-2031). The SDK still makes
the network calls (clients, Checkout and portal sessions, subscription re-read).
"""

import asyncio
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, Protocol

from learny.billing.domain.config import WEBHOOK_TOLERANCE_SECONDS, BillingConfig
from learny.billing.domain.webhook import (
    StripeEvent,
    parse_event,
    sign_payload,
    verify_signature,
)
from learny.shared.errors import AppError
from learny.shared.jsonx import dumps
from learny.shared.locale_fr import billing as fr

STRIPE_TIMEOUT_SECONDS = 10.0
THIRTY_DAYS = timedelta(days=30)
JOURNAL_LIMIT = 200

# Failure kinds the service translates; everything else becomes `SERVICE_UNAVAILABLE`.
RESOURCE_MISSING = "resource_missing"


@dataclass(frozen=True, slots=True)
class StripeSubscriptionState:
    """Current state of a Stripe subscription, read again after every event (ADR-0215)."""

    id: str
    customer_id: str
    status: str
    current_period_end: datetime
    user_id: str | None


@dataclass(frozen=True, slots=True)
class CreateCustomerInput:
    user_id: str
    email: str | None
    idempotency_key: str


@dataclass(frozen=True, slots=True)
class CreateCheckoutInput:
    customer_id: str
    user_id: str
    success_url: str
    cancel_url: str
    success_path: str
    cancel_path: str
    idempotency_key: str


@dataclass(frozen=True, slots=True)
class CreatePortalInput:
    customer_id: str
    return_url: str
    return_path: str


class StripeGateway(Protocol):
    """What the billing use cases need from the payment provider."""

    @property
    def mode(self) -> str: ...

    async def create_customer(self, data: CreateCustomerInput) -> str: ...

    async def create_checkout_session(self, data: CreateCheckoutInput) -> dict[str, str]: ...

    async def create_portal_session(self, data: CreatePortalInput) -> str: ...

    async def retrieve_subscription(self, subscription_id: str) -> StripeSubscriptionState: ...

    def construct_event(self, payload: str, signature: str | None, now: datetime) -> StripeEvent: ...


def translate_stripe_error(error: BaseException) -> AppError:
    """Never forwards the SDK message (it may quote identifiers): a stable code, a French detail."""
    if isinstance(error, AppError):
        return error
    if _is_resource_missing(error):
        return AppError("NOT_FOUND", fr.RESOURCE_NOT_FOUND)
    return AppError("SERVICE_UNAVAILABLE", fr.UNAVAILABLE)


def _is_resource_missing(error: BaseException) -> bool:
    return getattr(error, "code", None) == RESOURCE_MISSING


def _field(payload: Any, name: str, default: Any = None) -> Any:
    """Reads a field of an SDK object, which is both a mapping and an attribute holder."""
    if isinstance(payload, dict):
        return payload.get(name, default)
    return getattr(payload, name, default)


class StripeSdkGateway:
    """Real gateway: the `stripe` SDK, server-side key, bounded timeout and one retry."""

    def __init__(self, config: BillingConfig, client: Any | None = None) -> None:
        self._config = config
        self._mode = "live" if config.mode == "live" else "test"
        self._client = client

    @property
    def mode(self) -> str:
        return self._mode

    def _sdk(self) -> Any:
        if self._client is None:
            import stripe

            client = stripe.StripeClient(self._config.secret_key or "", max_network_retries=1)
            self._client = client.v1
        return self._client

    def _options(self, idempotency_key: str) -> dict[str, Any]:
        return {"idempotency_key": idempotency_key, "timeout": STRIPE_TIMEOUT_SECONDS}

    def _require_price_id(self) -> str:
        if self._config.price_id is None:
            raise AppError("SERVICE_UNAVAILABLE", fr.UNAVAILABLE)
        return self._config.price_id

    async def create_customer(self, data: CreateCustomerInput) -> str:
        params: dict[str, Any] = {"metadata": {"userId": data.user_id}}
        if data.email is not None:
            params["email"] = data.email
        try:
            customer = await asyncio.to_thread(
                self._sdk().customers.create, params, self._options(data.idempotency_key)
            )
        except Exception as error:  # the SDK raises many shapes; the translation is stable
            raise translate_stripe_error(error) from error
        return str(_field(customer, "id", ""))

    async def create_checkout_session(self, data: CreateCheckoutInput) -> dict[str, str]:
        params: dict[str, Any] = {
            "mode": "subscription",
            "customer": data.customer_id,
            "client_reference_id": data.user_id,
            "line_items": [{"price": self._require_price_id(), "quantity": 1}],
            "success_url": data.success_url,
            "cancel_url": data.cancel_url,
            "locale": "fr",
            "metadata": {"userId": data.user_id},
            "subscription_data": {"metadata": {"userId": data.user_id}},
        }
        try:
            session = await asyncio.to_thread(
                self._sdk().checkout.sessions.create, params, self._options(data.idempotency_key)
            )
        except Exception as error:
            raise translate_stripe_error(error) from error
        url = _field(session, "url")
        if not isinstance(url, str) or url == "":
            raise AppError("SERVICE_UNAVAILABLE", fr.UNAVAILABLE)
        return {"id": str(_field(session, "id", "")), "url": url}

    async def create_portal_session(self, data: CreatePortalInput) -> str:
        params = {"customer": data.customer_id, "return_url": data.return_url}
        try:
            session = await asyncio.to_thread(self._sdk().billing_portal.sessions.create, params, None)
        except Exception as error:
            raise translate_stripe_error(error) from error
        return str(_field(session, "url", ""))

    async def retrieve_subscription(self, subscription_id: str) -> StripeSubscriptionState:
        try:
            subscription = await asyncio.to_thread(self._sdk().subscriptions.retrieve, subscription_id, None)
        except Exception as error:
            raise translate_stripe_error(error) from error
        customer = _field(subscription, "customer")
        customer_id = customer if isinstance(customer, str) else str(_field(customer, "id", ""))
        period_end = _field(subscription, "current_period_end")
        metadata = _field(subscription, "metadata") or {}
        user_id = _field(metadata, "userId")
        return StripeSubscriptionState(
            id=str(_field(subscription, "id", "")),
            customer_id=customer_id,
            status=str(_field(subscription, "status", "")),
            current_period_end=datetime.fromtimestamp(int(period_end), tz=UTC),
            user_id=user_id if isinstance(user_id, str) and user_id != "" else None,
        )

    def construct_event(self, payload: str, signature: str | None, now: datetime) -> StripeEvent:
        """Signature first (ADR-2031), then the shape of the event."""
        secret = self._config.webhook_secret
        if secret is None:
            raise AppError("SERVICE_UNAVAILABLE", fr.UNAVAILABLE)
        verify_signature(payload, signature, secret, now, WEBHOOK_TOLERANCE_SECONDS)
        return parse_event(payload)


@dataclass
class MockCheckoutSession:
    """A simulated Checkout session, kept so the demonstration can pay or cancel it."""

    id: str
    customer_id: str
    user_id: str
    success_path: str
    cancel_path: str
    status: Literal["open", "complete", "canceled"] = "open"
    subscription_id: str | None = None


@dataclass
class MockSubscription:
    id: str
    customer_id: str
    user_id: str
    status: str
    current_period_end: datetime


@dataclass
class MockStripeState:
    """In-memory state of the simulated gateway (one instance per process, from `Deps`)."""

    customers: dict[str, dict[str, str]] = field(default_factory=dict)
    customer_keys: dict[str, str] = field(default_factory=dict)
    sessions: dict[str, MockCheckoutSession] = field(default_factory=dict)
    session_keys: dict[str, str] = field(default_factory=dict)
    subscriptions: dict[str, MockSubscription] = field(default_factory=dict)
    counters: dict[str, int] = field(
        default_factory=lambda: dict.fromkeys(("customer", "subscription", "session", "event"), 0)
    )


def create_mock_state(start: int = 0) -> MockStripeState:
    """A fresh state whose identifiers start at `start + 1`."""
    return MockStripeState(counters=dict.fromkeys(("customer", "subscription", "session", "event"), start))


@dataclass(frozen=True, slots=True)
class MockDelivery:
    """A signed webhook, ready to be delivered to the webhook use case."""

    event_id: str
    type: str
    created: int
    payload: str
    signature: str


class MockStripeGateway:
    """Deterministic simulation of Stripe: numbered identifiers, clock-driven, no network."""

    def __init__(
        self,
        clock: Any,
        webhook_secret: str,
        state: MockStripeState | None = None,
    ) -> None:
        self._clock = clock
        self._webhook_secret = webhook_secret
        self.state = state if state is not None else create_mock_state()

    @property
    def mode(self) -> str:
        return "mock"

    async def create_customer(self, data: CreateCustomerInput) -> str:
        known = self.state.customer_keys.get(data.idempotency_key)
        if known is not None:
            return known
        self.state.counters["customer"] += 1
        identifier = f"cus_mock_{self.state.counters['customer']}"
        self.state.customers[identifier] = {"id": identifier, "userId": data.user_id}
        self.state.customer_keys[data.idempotency_key] = identifier
        return identifier

    async def create_checkout_session(self, data: CreateCheckoutInput) -> dict[str, str]:
        known = self.state.session_keys.get(data.idempotency_key)
        existing = None if known is None else self.state.sessions.get(known)
        if existing is not None:
            return {"id": existing.id, "url": mock_checkout_url(existing.id)}
        self.state.counters["session"] += 1
        identifier = f"cs_mock_{self.state.counters['session']}"
        self.state.sessions[identifier] = MockCheckoutSession(
            id=identifier,
            customer_id=data.customer_id,
            user_id=data.user_id,
            success_path=data.success_path,
            cancel_path=data.cancel_path,
        )
        self.state.session_keys[data.idempotency_key] = identifier
        return {"id": identifier, "url": mock_checkout_url(identifier)}

    async def create_portal_session(self, data: CreatePortalInput) -> str:
        return f"/_dev/stripe/portal?return={_quote(data.return_path)}"

    async def retrieve_subscription(self, subscription_id: str) -> StripeSubscriptionState:
        subscription = self.state.subscriptions.get(subscription_id)
        if subscription is None:
            raise AppError("NOT_FOUND", fr.RESOURCE_NOT_FOUND)
        return StripeSubscriptionState(
            id=subscription.id,
            customer_id=subscription.customer_id,
            status=subscription.status,
            current_period_end=subscription.current_period_end,
            user_id=subscription.user_id,
        )

    def construct_event(self, payload: str, signature: str | None, now: datetime) -> StripeEvent:
        verify_signature(payload, signature, self._webhook_secret, now, WEBHOOK_TOLERANCE_SECONDS)
        return parse_event(payload)

    # --- simulation helpers (dev pages, e2e and tests) -------------------------------------------

    def get_checkout_session(self, session_id: str) -> MockCheckoutSession | None:
        return self.state.sessions.get(session_id)

    def sign(self, payload: str, at: datetime | None = None) -> str:
        """Header for `payload` signed now (a retry of Stripe signs again with the current time)."""
        return sign_payload(payload, self._webhook_secret, at if at is not None else self._clock.now())

    def create_event(
        self,
        event_type: str,
        obj: dict[str, Any],
        *,
        created: int | None = None,
        event_id: str | None = None,
    ) -> MockDelivery:
        """Builds and signs an event of `type` carrying `object` (EF-7)."""
        self.state.counters["event"] += 1
        identifier = event_id or f"evt_mock_{self.state.counters['event']}"
        moment = created if created is not None else int(self._clock.now().timestamp())
        payload = dumps(
            {"id": identifier, "type": event_type, "created": moment, "data": {"object": obj}}
        ).decode("utf-8")
        return MockDelivery(
            event_id=identifier,
            type=event_type,
            created=moment,
            payload=payload,
            signature=self.sign(payload),
        )

    def complete_checkout(self, session_id: str, *, created: int | None = None) -> MockDelivery:
        """The learner pays: the subscription becomes `active` for thirty days."""
        session = self.state.sessions.get(session_id)
        if session is None or session.status != "open":
            raise AppError("NOT_FOUND", fr.RESOURCE_NOT_FOUND)
        self.state.counters["subscription"] += 1
        subscription_id = f"sub_mock_{self.state.counters['subscription']}"
        self.state.subscriptions[subscription_id] = MockSubscription(
            id=subscription_id,
            customer_id=session.customer_id,
            user_id=session.user_id,
            status="active",
            current_period_end=self._clock.now() + THIRTY_DAYS,
        )
        session.status = "complete"
        session.subscription_id = subscription_id
        return self.create_event(
            "checkout.session.completed",
            {
                "id": session.id,
                "customer": session.customer_id,
                "subscription": subscription_id,
                "client_reference_id": session.user_id,
                "metadata": {"userId": session.user_id},
            },
            created=created,
        )

    def cancel_checkout(self, session_id: str) -> MockCheckoutSession:
        session = self.state.sessions.get(session_id)
        if session is None or session.status != "open":
            raise AppError("NOT_FOUND", fr.RESOURCE_NOT_FOUND)
        session.status = "canceled"
        return session

    def _subscription(self, subscription_id: str) -> MockSubscription:
        subscription = self.state.subscriptions.get(subscription_id)
        if subscription is None:
            raise AppError("NOT_FOUND", fr.RESOURCE_NOT_FOUND)
        return subscription

    def _subscription_object(self, subscription: MockSubscription) -> dict[str, Any]:
        return {
            "id": subscription.id,
            "customer": subscription.customer_id,
            "status": subscription.status,
            "metadata": {"userId": subscription.user_id},
        }

    def fail_payment(self, subscription_id: str, *, created: int | None = None) -> MockDelivery:
        """A renewal payment fails: the subscription becomes `past_due`."""
        subscription = self._subscription(subscription_id)
        subscription.status = "past_due"
        return self.create_event(
            "invoice.payment_failed",
            {
                "customer": subscription.customer_id,
                "subscription": subscription.id,
                "subscription_details": {"metadata": {"userId": subscription.user_id}},
            },
            created=created,
        )

    def cancel_subscription(self, subscription_id: str, *, created: int | None = None) -> MockDelivery:
        """The subscription ends (portal "Resilier"): `customer.subscription.deleted`."""
        subscription = self._subscription(subscription_id)
        subscription.status = "canceled"
        return self.create_event(
            "customer.subscription.deleted", self._subscription_object(subscription), created=created
        )

    def renew_subscription(self, subscription_id: str, *, created: int | None = None) -> MockDelivery:
        """The subscription is renewed or changed: `customer.subscription.updated`."""
        subscription = self._subscription(subscription_id)
        subscription.status = "active"
        subscription.current_period_end = self._clock.now() + THIRTY_DAYS
        return self.create_event(
            "customer.subscription.updated", self._subscription_object(subscription), created=created
        )

    def set_subscription_state(
        self, subscription_id: str, status: str, current_period_end: datetime | None = None
    ) -> None:
        """Test helper: puts a subscription in any Stripe status without building an event."""
        subscription = self._subscription(subscription_id)
        subscription.status = status
        if current_period_end is not None:
            subscription.current_period_end = current_period_end


def is_mock_gateway(gateway: StripeGateway) -> bool:
    """True for the simulated gateway (one process, so the class check is enough)."""
    return isinstance(gateway, MockStripeGateway)


def mock_checkout_url(session_id: str) -> str:
    return f"/_dev/stripe/checkout?session={session_id}"


def _quote(value: str) -> str:
    """`encodeURIComponent`: the portal return path, quotes included."""
    from urllib.parse import quote

    return quote(value, safe="-_.!~*'()")


@dataclass(frozen=True, slots=True)
class JournalEntry:
    """One recent webhook outcome, kept in memory for the simulated mode only (EF-8)."""

    event_id: str
    type: str
    user_id: str | None
    at: str
    result: str
    payload: str


class WebhookJournal:
    """Recent webhook outcomes, in memory, for the simulated mode only (EF-8)."""

    def __init__(self, limit: int = JOURNAL_LIMIT) -> None:
        self._entries: list[JournalEntry] = []
        self._limit = limit

    @property
    def entries(self) -> list[JournalEntry]:
        return list(self._entries)

    def add(self, entry: JournalEntry) -> None:
        self._entries.append(entry)
        if len(self._entries) > self._limit:
            self._entries.pop(0)

    def list(self, user_id: str) -> list[JournalEntry]:
        return [entry for entry in self._entries if entry.user_id == user_id]

    def last(self, user_id: str) -> JournalEntry | None:
        entries = self.list(user_id)
        return entries[-1] if entries else None


def build_stripe_gateway(config: BillingConfig, clock: Any) -> StripeGateway:
    """The gateway `STRIPE_MODE` selects; the mock needs the clock, the SDK needs the key."""
    if config.mode == "mock":
        secret = config.webhook_secret or "learny-mock-webhook-secret"
        return MockStripeGateway(clock, secret)
    return StripeSdkGateway(config)


__all__ = [
    "JOURNAL_LIMIT",
    "STRIPE_TIMEOUT_SECONDS",
    "THIRTY_DAYS",
    "CreateCheckoutInput",
    "CreateCustomerInput",
    "CreatePortalInput",
    "JournalEntry",
    "MockCheckoutSession",
    "MockDelivery",
    "MockStripeGateway",
    "MockStripeState",
    "MockSubscription",
    "StripeEvent",
    "StripeGateway",
    "StripeSdkGateway",
    "StripeSubscriptionState",
    "WebhookJournal",
    "build_stripe_gateway",
    "create_mock_state",
    "is_mock_gateway",
    "mock_checkout_url",
    "translate_stripe_error",
]
