"""Stripe webhook processing (SPEC-210 EF-4, ET-4, ET-5, CL-1 to CL-3, CL-9; ADR-0215).

Port of `packages/services/src/billing/webhook.ts`. One transaction: the event is claimed in
`stripe_events` (a duplicate stops there), the learner's subscription row is locked, an event older
than the last one applied is dropped, then the subscription is READ AGAIN from Stripe and the row is
updated from that state. The events that follow a change are written in the same transaction
(outbox) and dispatched after the commit.
"""

import re
from dataclasses import dataclass
from datetime import datetime

from learny.billing.application.ports import BillingDeps
from learny.billing.domain.entitlements import (
    announces_payment_failure,
    change_of,
    payment_failed_event_id,
    payment_failed_payload,
    subscription_changed_event_id,
    subscription_changed_payload,
)
from learny.billing.domain.subscription import is_known_stripe_status, map_stripe_status, mask_stripe_id
from learny.billing.domain.webhook import StripeEvent, is_handled_event_type
from learny.billing.infrastructure import queries
from learny.platform.stripe import JournalEntry, StripeSubscriptionState
from learny.shared.db.uow import Tx, event_id_for
from learny.shared.errors import AppError
from learny.shared.time import from_epoch_ms, to_iso

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class WebhookOutcome:
    """How a delivery was treated (`WebhookResult` of the contract)."""

    result: str
    user_id: str | None
    event_id: str
    type: str


async def _find_row(tx: Tx, event: StripeEvent) -> queries.SubscriptionRow | None:
    if event.user_id is not None and UUID.match(event.user_id) is not None:
        by_user = await queries.lock_subscription(tx, event.user_id)
        if by_user is not None:
            return by_user
    if event.customer_id is not None:
        return await queries.lock_subscription_by_customer(tx, event.customer_id)
    return None


async def _apply_event(tx: Tx, event: StripeEvent, deps: BillingDeps) -> tuple[str, str | None]:
    now = deps.clock.now()
    created_at = from_epoch_ms(event.created * 1000)
    if not await queries.claim_event(tx, event.id, event.type, created_at):
        return ("duplicate", event.user_id)

    row = await _find_row(tx, event)
    if row is None:
        # CL-9 - a customer we do not know: acknowledged, kept as processed, never a new user.
        await queries.mark_processed(tx, event.id, now)
        deps.logger.error(
            "stripe event for an unknown customer",
            operation="stripe.webhook",
            outcome="unknown_customer",
            customer=mask_stripe_id(event.customer_id),
        )
        return ("unknown_customer", None)

    # CL-2 - an older event never overwrites a newer state.
    if row.stripe_event_at is not None and created_at < row.stripe_event_at:
        await queries.mark_processed(tx, event.id, now)
        return ("stale", row.user_id)

    subscription_id = event.subscription_id or row.stripe_subscription_id
    if subscription_id is None:
        await queries.mark_processed(tx, event.id, now)
        deps.logger.warn(
            "stripe event without subscription",
            operation="stripe.webhook",
            outcome="ignored",
            eventType=event.type,
        )
        return ("ignored", row.user_id)

    try:
        state: StripeSubscriptionState = await deps.stripe.retrieve_subscription(subscription_id)
    except AppError as error:
        if error.code == "NOT_FOUND":
            await queries.mark_processed(tx, event.id, now)
            deps.logger.error(
                "stripe subscription not found",
                operation="stripe.webhook",
                outcome="ignored",
                subscription=mask_stripe_id(subscription_id),
            )
            return ("ignored", row.user_id)
        raise

    if row.stripe_customer_id is not None and row.stripe_customer_id != state.customer_id:
        await queries.mark_processed(tx, event.id, now)
        deps.logger.error(
            "stripe customer mismatch",
            operation="stripe.webhook",
            outcome="unknown_customer",
            customer=mask_stripe_id(state.customer_id),
        )
        return ("unknown_customer", row.user_id)

    if not is_known_stripe_status(state.status):
        deps.logger.warn(
            "unknown stripe status",
            operation="stripe.webhook",
            outcome="unknown_status",
            stripeStatus=state.status,
        )
    status = map_stripe_status(state.status)
    await queries.apply_subscription_state(
        tx,
        row.user_id,
        status=status,
        customer_id=state.customer_id,
        subscription_id=state.id,
        current_period_end=state.current_period_end,
        stripe_event_at=created_at,
        now=now,
    )
    await queries.mark_processed(tx, event.id, now)

    # ET-5 - a change of status is announced once; a failed payment always is.
    change = change_of(row.status, status, event.id)  # type: ignore[arg-type]
    if change.changed:
        payload = subscription_changed_payload(row.user_id, change)
        await tx.emit(
            "billing/subscription-changed",
            payload,
            event_id=subscription_changed_event_id(event.id),
            user_id=row.user_id,
        )
    if announces_payment_failure(event.type):
        await tx.emit(
            "billing/payment-failed",
            payment_failed_payload(row.user_id),
            event_id=payment_failed_event_id(event.id),
            user_id=row.user_id,
        )
    deps.logger.info(
        "stripe event applied",
        operation="stripe.webhook",
        outcome="applied",
        eventType=event.type,
        customer=mask_stripe_id(state.customer_id),
        previousStatus=row.status,
        status=status,
    )
    return ("applied", row.user_id)


async def handle_webhook(deps: BillingDeps, payload: str, signature: str | None) -> WebhookOutcome:
    """EF-4 - verifies the signature, then applies the event; always 200 for a verified event."""
    event = deps.stripe.construct_event(payload, signature, deps.clock.now())
    if not is_handled_event_type(event.type):
        outcome: tuple[str, str | None] = ("ignored", event.user_id)
    else:
        async with deps.db.service_tx() as tx:
            outcome = await _apply_event(tx, event, deps)
    result, user_id = outcome
    journal = deps.webhook_journal
    if journal is not None:
        journal.add(
            JournalEntry(
                event_id=event.id,
                type=event.type,
                user_id=user_id if user_id is not None else event.user_id,
                at=to_iso(deps.clock.now()),
                result=result,
                payload=payload,
            )
        )
    return WebhookOutcome(result=result, user_id=user_id, event_id=event.id, type=event.type)


def fallback_event_id(name: str, data: dict[str, object]) -> str:
    """The default outbox identifier of an event of this context (shared helper)."""
    return event_id_for(name, data)


def _instant_of(event: StripeEvent) -> datetime:
    return from_epoch_ms(event.created * 1000)
