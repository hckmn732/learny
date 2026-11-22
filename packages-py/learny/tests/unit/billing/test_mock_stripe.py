"""[SPEC-2206] Simulated Stripe gateway (ported from `billing/mock-stripe.test.ts`, SPEC-210 ET-2).

The simulation numbers its identifiers, replays an idempotency key, signs its webhooks with the
documented scheme and never reaches the network.
"""

import pytest
from learny.billing.domain.subscription import map_stripe_status
from learny.platform.stripe import (
    CreateCheckoutInput,
    CreateCustomerInput,
    CreatePortalInput,
    MockStripeGateway,
    create_mock_state,
    is_mock_gateway,
    mock_checkout_url,
)
from learny.shared.clock import FixedClock
from learny.shared.errors import AppError
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2206")

NOW = parse_iso("2026-11-11T12:20:00Z")
WEBHOOK_KEY = "learny-mock-signing-value"


def gateway(start: int = 0) -> MockStripeGateway:
    clock = FixedClock(NOW)
    return MockStripeGateway(clock, WEBHOOK_KEY, create_mock_state(start))


def checkout_input(key: str = "checkout:u-1:k") -> CreateCheckoutInput:
    return CreateCheckoutInput(
        customer_id="cus_mock_1",
        user_id="11111111-1111-4111-8111-111111111111",
        success_url="https://learny.test/ok",
        cancel_url="https://learny.test/no",
        success_path="/ok",
        cancel_path="/no",
        idempotency_key=key,
    )


async def test_identifiers_are_numbered_and_customers_are_idempotent() -> None:
    stripe = gateway()
    first = await stripe.create_customer(
        CreateCustomerInput(user_id="u1", email="a@b.test", idempotency_key="customer:u1")
    )
    again = await stripe.create_customer(
        CreateCustomerInput(user_id="u1", email="a@b.test", idempotency_key="customer:u1")
    )
    second = await stripe.create_customer(
        CreateCustomerInput(user_id="u2", email=None, idempotency_key="customer:u2")
    )
    assert (first, again, second) == ("cus_mock_1", "cus_mock_1", "cus_mock_2")
    assert is_mock_gateway(stripe) is True


async def test_a_checkout_session_is_replayed_for_the_same_key() -> None:
    stripe = gateway()
    first = await stripe.create_checkout_session(checkout_input("cle-a"))
    second = await stripe.create_checkout_session(checkout_input("cle-a"))
    other = await stripe.create_checkout_session(checkout_input("cle-b"))
    assert first == second
    assert first["url"] == mock_checkout_url("cs_mock_1")
    assert other["id"] == "cs_mock_2"


async def test_paying_opens_an_active_subscription_and_signs_an_event() -> None:
    stripe = gateway()
    await stripe.create_customer(CreateCustomerInput(user_id="u1", email=None, idempotency_key="customer:u1"))
    await stripe.create_checkout_session(checkout_input())
    delivery = stripe.complete_checkout("cs_mock_1")
    assert delivery.event_id == "evt_mock_1"
    assert delivery.type == "checkout.session.completed"
    event = stripe.construct_event(delivery.payload, delivery.signature, NOW)
    assert event.subscription_id == "sub_mock_1"
    state = await stripe.retrieve_subscription("sub_mock_1")
    assert state.status == "active"
    assert map_stripe_status(state.status) == "active"
    assert state.current_period_end == NOW.replace(day=11) + (state.current_period_end - NOW)


async def test_cancelling_a_checkout_or_a_subscription_is_recorded() -> None:
    stripe = gateway()
    await stripe.create_checkout_session(checkout_input())
    session = stripe.cancel_checkout("cs_mock_1")
    assert session.status == "canceled"
    with pytest.raises(AppError):
        stripe.cancel_checkout("cs_mock_1")


async def test_a_failed_payment_moves_the_subscription_to_past_due() -> None:
    stripe = gateway()
    await stripe.create_checkout_session(checkout_input())
    stripe.complete_checkout("cs_mock_1")
    delivery = stripe.fail_payment("sub_mock_1")
    assert delivery.type == "invoice.payment_failed"
    state = await stripe.retrieve_subscription("sub_mock_1")
    assert state.status == "past_due"


async def test_deleting_and_renewing_a_subscription_build_their_events() -> None:
    stripe = gateway()
    await stripe.create_checkout_session(checkout_input())
    stripe.complete_checkout("cs_mock_1")
    deleted = stripe.cancel_subscription("sub_mock_1")
    assert deleted.type == "customer.subscription.deleted"
    renewed = stripe.renew_subscription("sub_mock_1")
    assert renewed.type == "customer.subscription.updated"
    state = await stripe.retrieve_subscription("sub_mock_1")
    assert state.status == "active"


async def test_an_unknown_subscription_is_a_not_found_and_the_state_is_settable() -> None:
    stripe = gateway()
    with pytest.raises(AppError) as raised:
        await stripe.retrieve_subscription("sub_mock_404")
    assert raised.value.code == "NOT_FOUND"
    await stripe.create_checkout_session(checkout_input())
    stripe.complete_checkout("cs_mock_1")
    stripe.set_subscription_state("sub_mock_1", "trialing")
    assert (await stripe.retrieve_subscription("sub_mock_1")).status == "trialing"


async def test_the_portal_url_keeps_the_return_path_and_a_bad_signature_is_refused() -> None:
    stripe = gateway()
    url = await stripe.create_portal_session(
        CreatePortalInput(
            customer_id="cus_mock_1",
            return_url="https://learny.test/parametres",
            return_path="/parametres#abonnement",
        )
    )
    assert url == "/_dev/stripe/portal?return=%2Fparametres%23abonnement"
    delivery = stripe.create_event("customer.created", {"id": "cus_mock_9"})
    with pytest.raises(AppError) as raised:
        stripe.construct_event(f"{delivery.payload} ", delivery.signature, NOW)
    assert raised.value.code == "INVALID_SIGNATURE"
