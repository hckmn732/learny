"""Access and opening rules of the subscription (SPEC-210 EF-1, EF-3, EF-5; BR-PLA-05).

The subscription row *is* the entitlement: `active` (which Stripe reports for `active` and
`trialing`) grants the right to use the application, every other status grants nothing. These rules
are pure so the use cases and the contract agree by construction.
"""

from dataclasses import dataclass

from learny.billing.domain.subscription import SubscriptionStatus

# `checkout.session.completed` is the only type that opens a subscription; the others evolve it.
OPENING_EVENT_TYPES: tuple[str, ...] = ("checkout.session.completed",)
PAYMENT_FAILED_EVENT_TYPE = "invoice.payment_failed"

SUBSCRIPTION_CHANGED_EVENT = "billing/subscription-changed"
PAYMENT_FAILED_EVENT = "billing/payment-failed"


def grants_access(status: SubscriptionStatus | str) -> bool:
    """True only for `active`: the entitlement of the application, never a model or an add-on."""
    return status == "active"


def blocks_new_checkout(status: SubscriptionStatus | str) -> bool:
    """EF-1 - a learner already `active` cannot open a second Checkout (`ALREADY_SUBSCRIBED`).

    A canceled learner may subscribe again.
    """
    return status == "active"


def can_open_portal(customer_id: str | None) -> bool:
    """EF-2 - the portal needs a Stripe customer; without one the answer is `NOT_FOUND`."""
    return customer_id is not None and customer_id != ""


@dataclass(frozen=True, slots=True)
class SubscriptionChange:
    """One announced change of status (ET-5), with the event id the outbox expects."""

    previous: SubscriptionStatus
    current: SubscriptionStatus
    event_id_suffix: str

    @property
    def changed(self) -> bool:
        return self.previous != self.current


def change_of(previous: SubscriptionStatus, current: SubscriptionStatus, event_id: str) -> SubscriptionChange:
    """A status change is announced once per Stripe event (ET-5)."""
    return SubscriptionChange(previous=previous, current=current, event_id_suffix=event_id)


def subscription_changed_payload(user_id: str, change: SubscriptionChange) -> dict[str, object]:
    """Payload of `billing/subscription-changed`, in the published key order."""
    return {"userId": user_id, "status": change.current, "previousStatus": change.previous}


def subscription_changed_event_id(event_id: str) -> str:
    """`billing-subscription-changed:<eventId>` - idempotent across a Stripe redelivery."""
    return f"billing-subscription-changed:{event_id}"


def payment_failed_event_id(event_id: str) -> str:
    """`billing-payment-failed:<eventId>` - idempotent across a Stripe redelivery."""
    return f"billing-payment-failed:{event_id}"


def payment_failed_payload(user_id: str) -> dict[str, object]:
    """Payload of `billing/payment-failed` (SPEC-725 notifies the learner)."""
    return {"userId": user_id}


def announces_payment_failure(event_type: str) -> bool:
    """A failed payment is always announced, even when the status did not change."""
    return event_type == PAYMENT_FAILED_EVENT_TYPE
