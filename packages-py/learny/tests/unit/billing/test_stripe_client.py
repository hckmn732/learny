"""[SPEC-2206] Real Stripe gateway against a fake SDK (ported from `billing/stripe-client.test.ts`).

Every SDK call is a fake: no key leaves the process and no network call happens. The error
translation never forwards the SDK message.
"""

from dataclasses import replace
from typing import Any

import pytest
from learny.billing.domain.config import BillingConfig
from learny.platform.stripe import (
    CreateCheckoutInput,
    CreateCustomerInput,
    CreatePortalInput,
    StripeSdkGateway,
    translate_stripe_error,
)
from learny.shared.errors import AppError
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2206")

NOW = parse_iso("2026-11-11T12:20:00Z")
WEBHOOK_KEY = "learny-sdk-signing-value"

CONFIG = BillingConfig(
    mode="test",
    secret_key="sk_test_fake_key",
    webhook_secret=WEBHOOK_KEY,
    price_id="price_fake",
    app_url="https://learny.test",
)


class FakeNamespace:
    def __init__(self, calls: list[tuple[str, Any, Any]]) -> None:
        self._calls = calls
        self.result: Any = None
        self.error: BaseException | None = None

    def _record(self, name: str, params: Any, options: Any) -> Any:
        self._calls.append((name, params, options))
        if self.error is not None:
            raise self.error
        return self.result

    def create(self, params: Any, options: Any) -> Any:
        return self._record("create", params, options)

    def retrieve(self, identifier: str, options: Any = None) -> Any:
        self._calls.append(("retrieve", identifier, options))
        if self.error is not None:
            raise self.error
        return self.result


class FakeClient:
    """The `v1` namespace of the SDK, with one namespace per resource used by the gateway."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, Any, Any]] = []
        self.customers = FakeNamespace(self.calls)
        self.subscriptions = FakeNamespace(self.calls)
        checkout = FakeNamespace(self.calls)
        portal = FakeNamespace(self.calls)
        self.checkout = type("Checkout", (), {"sessions": checkout})()
        self.billing_portal = type("Portal", (), {"sessions": portal})()
        self.checkout_sessions = checkout
        self.portal_sessions = portal


def gateway(config: BillingConfig = CONFIG) -> tuple[FakeClient, StripeSdkGateway]:
    client = FakeClient()
    return client, StripeSdkGateway(config, client)


async def test_the_mode_is_exposed_and_the_client_is_built_lazily() -> None:
    assert gateway()[1].mode == "test"
    assert gateway(replace(CONFIG, mode="live"))[1].mode == "live"
    StripeSdkGateway(CONFIG)  # building the real client makes no network call


async def test_the_customer_carries_the_account_and_the_idempotency_key() -> None:
    client, stripe = gateway()
    client.customers.result = {"id": "cus_1"}
    assert (
        await stripe.create_customer(
            CreateCustomerInput(user_id="u1", email="a@b.test", idempotency_key="customer:u1")
        )
        == "cus_1"
    )
    assert client.calls[-1][1] == {"metadata": {"userId": "u1"}, "email": "a@b.test"}
    assert client.calls[-1][2]["idempotency_key"] == "customer:u1"
    await stripe.create_customer(CreateCustomerInput(user_id="u2", email=None, idempotency_key="customer:u2"))
    assert client.calls[-1][1] == {"metadata": {"userId": "u2"}}


async def test_a_missing_price_or_url_is_unavailable_and_a_resource_is_not_found() -> None:
    client, stripe = gateway(replace(CONFIG, price_id=None))
    with pytest.raises(AppError) as raised:
        await stripe.create_checkout_session(checkout_input())
    assert raised.value.code == "SERVICE_UNAVAILABLE"

    client, stripe = gateway()
    client.checkout_sessions.result = {"id": "cs_1", "url": None}
    with pytest.raises(AppError) as raised:
        await stripe.create_checkout_session(checkout_input())
    assert raised.value.code == "SERVICE_UNAVAILABLE"

    missing = AppError("NOT_FOUND", "missing")
    assert translate_stripe_error(missing) is missing
    assert translate_stripe_error(RuntimeError("network")).code == "SERVICE_UNAVAILABLE"
    assert "network" not in str(translate_stripe_error(RuntimeError("network")).detail)


async def test_the_checkout_and_portal_sessions_use_the_expected_parameters() -> None:
    client, stripe = gateway()
    client.checkout_sessions.result = {"id": "cs_1", "url": "https://checkout.stripe.test/cs_1"}
    assert await stripe.create_checkout_session(checkout_input()) == {
        "id": "cs_1",
        "url": "https://checkout.stripe.test/cs_1",
    }
    params = client.calls[-1][1]
    assert params["mode"] == "subscription"
    assert params["line_items"] == [{"price": "price_fake", "quantity": 1}]
    assert params["locale"] == "fr"
    assert params["subscription_data"] == {"metadata": {"userId": "u1"}}

    client.portal_sessions.result = {"url": "https://portal.test"}
    assert (
        await stripe.create_portal_session(
            CreatePortalInput(
                customer_id="cus_1",
                return_url="https://learny.test/parametres",
                return_path="/parametres#abonnement",
            )
        )
        == "https://portal.test"
    )
    assert client.calls[-1][1] == {
        "customer": "cus_1",
        "return_url": "https://learny.test/parametres",
    }


async def test_the_subscription_state_is_read_back_with_an_expanded_customer() -> None:
    client, stripe = gateway()
    client.subscriptions.result = {
        "id": "sub_1",
        "customer": "cus_1",
        "status": "active",
        "current_period_end": 1_800_000_000,
        "metadata": {"userId": "u1"},
    }
    state = await stripe.retrieve_subscription("sub_1")
    assert (state.id, state.customer_id, state.status, state.user_id) == (
        "sub_1",
        "cus_1",
        "active",
        "u1",
    )
    client.subscriptions.result = {
        "id": "sub_2",
        "customer": {"id": "cus_2"},
        "status": "past_due",
        "current_period_end": 1_800_000_000,
        "metadata": {},
    }
    state = await stripe.retrieve_subscription("sub_2")
    assert (state.customer_id, state.user_id) == ("cus_2", None)
    client.subscriptions.error = RuntimeError("down")
    with pytest.raises(AppError) as raised:
        await stripe.retrieve_subscription("sub_2")
    assert raised.value.code == "SERVICE_UNAVAILABLE"


async def test_the_signature_is_checked_with_the_injected_clock() -> None:
    _client, stripe = gateway()
    payload = (
        '{"id":"evt_1","type":"customer.subscription.updated","created":1700000000,'
        '"data":{"object":{"id":"sub_1","customer":"cus_1","metadata":{"userId":"u1"}}}}'
    )
    from learny.billing.domain.webhook import sign_payload

    header = sign_payload(payload, WEBHOOK_KEY, NOW)
    event = stripe.construct_event(payload, header, NOW)
    assert (event.id, event.user_id, event.customer_id, event.subscription_id) == (
        "evt_1",
        "u1",
        "cus_1",
        "sub_1",
    )
    for bad in (None, "  "):
        with pytest.raises(AppError) as raised:
            stripe.construct_event(payload, bad, NOW)
        assert raised.value.code == "INVALID_SIGNATURE"
    with pytest.raises(AppError) as raised:
        StripeSdkGateway(replace(CONFIG, webhook_secret=None)).construct_event(payload, header, NOW)
    assert raised.value.code == "SERVICE_UNAVAILABLE"


def checkout_input() -> CreateCheckoutInput:
    return CreateCheckoutInput(
        customer_id="cus_1",
        user_id="u1",
        success_url="https://learny.test/ok",
        cancel_url="https://learny.test/no",
        success_path="/ok",
        cancel_path="/no",
        idempotency_key="checkout:u1:k",
    )
