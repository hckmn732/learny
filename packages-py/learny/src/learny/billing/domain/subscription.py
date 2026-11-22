"""Stripe statuses to application statuses, and masking of Stripe identifiers (SPEC-210 EF-5, ET-6).

Port of `packages/services/src/billing/status.ts`: pure functions, no I/O, no clock. A status Stripe
adds later reads as `incomplete`, which grants nothing: the entitlement fails closed (ADR-0261).
"""

from typing import Literal

SubscriptionStatus = Literal["none", "active", "past_due", "canceled", "incomplete"]

# `EVENT_SUBSCRIPTION_STATUSES` of `packages/contracts/src/events.ts`: the only states the app knows.
SUBSCRIPTION_STATUSES: tuple[str, ...] = ("none", "active", "past_due", "canceled", "incomplete")

# Stripe statuses the service documents; anything else is mapped to `incomplete` and logged.
KNOWN_STRIPE_STATUSES: tuple[str, ...] = (
    "active",
    "trialing",
    "past_due",
    "unpaid",
    "paused",
    "canceled",
    "incomplete_expired",
    "incomplete",
)

STATUS_MAP: dict[str, str] = {
    "active": "active",
    "trialing": "active",
    "past_due": "past_due",
    "unpaid": "past_due",
    # A trial that ended without a payment method grants nothing and can be resumed from the portal.
    "paused": "past_due",
    "canceled": "canceled",
    "incomplete_expired": "canceled",
}

# `maskStripeId` renders the em dash and the ellipsis of the TypeScript source (kept as escapes so
# this module stays ASCII, ADR-2011).
MASKED_ID_PLACEHOLDER = "\u2014"
MASKED_ID_SEPARATOR = "\u2026"


def map_stripe_status(stripe_status: str) -> SubscriptionStatus:
    """`mapStripeStatus`: `active`/`trialing` grant access, everything unknown fails closed."""
    mapped = STATUS_MAP.get(stripe_status, "incomplete")
    return mapped  # type: ignore[return-value]


def is_known_stripe_status(stripe_status: str) -> bool:
    """True for a status Stripe documents (the others are mapped to `incomplete`, and logged)."""
    return stripe_status in KNOWN_STRIPE_STATUSES


def mask_stripe_id(identifier: str | None) -> str:
    """`maskStripeId`: `cus_1Abc23XyZ` -> `cus_...3XyZ`, the kind and the last four characters only."""
    if identifier is None or identifier == "":
        return MASKED_ID_PLACEHOLDER
    separator = identifier.find("_")
    kind = identifier[: separator + 1] if 0 < separator <= 8 else ""
    return f"{kind}{MASKED_ID_SEPARATOR}{identifier[-4:]}"
