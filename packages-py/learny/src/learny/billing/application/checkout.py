"""Checkout, customer portal and subscription reading (SPEC-210 EF-1, EF-2, EF-3, CL-5, CL-6, CL-8).

Port of `packages/services/src/billing/checkout.ts`. The learner's subscription row is locked for the
whole call, so two simultaneous clicks create a single Stripe customer; a Stripe outage rolls
everything back and leaves no partial row.
"""

from typing import Any

from learny.billing.application.ports import BillingDeps
from learny.billing.domain.checkout import PORTAL_RETURN_PATH, absolute_url
from learny.billing.domain.config import resolve_billing_config
from learny.billing.domain.entitlements import blocks_new_checkout, can_open_portal
from learny.billing.infrastructure import queries
from learny.platform.stripe import CreateCheckoutInput, CreateCustomerInput, CreatePortalInput
from learny.shared.errors import AppError
from learny.shared.ids import new_id
from learny.shared.locale_fr import billing as fr
from learny.shared.time import to_iso


def _require_user(actor: Any) -> str:
    user_id = getattr(actor, "user_id", None)
    if not isinstance(user_id, str) or user_id == "":
        raise AppError("UNAUTHENTICATED", fr.UNAUTHENTICATED)
    return user_id


async def start_checkout(
    deps: BillingDeps,
    actor: Any,
    body: dict[str, Any],
    idempotency_key: str | None = None,
) -> dict[str, str]:
    """EF-1 - creates the customer on the first call, then opens a Checkout session (CL-6)."""
    user_id = _require_user(actor)
    config = resolve_billing_config(deps.settings.billing_env())
    success_url = absolute_url(str(body["successPath"]), config.app_url, "successPath")
    cancel_url = absolute_url(str(body["cancelPath"]), config.app_url, "cancelPath")
    async with deps.db.service_tx() as tx:
        await queries.insert_subscription(tx, user_id)
        row = await queries.lock_subscription(tx, user_id)
        if row is None:
            raise AppError("INTERNAL_ERROR", fr.SUBSCRIPTION_NOT_FOUND)
        if blocks_new_checkout(row.status):
            raise AppError("ALREADY_SUBSCRIBED", fr.ALREADY_SUBSCRIBED)
        customer_id = row.stripe_customer_id
        if customer_id is None:
            email = await queries.profile_email(tx, user_id)
            customer_id = await deps.stripe.create_customer(
                CreateCustomerInput(user_id=user_id, email=email, idempotency_key=f"customer:{user_id}")
            )
            await queries.set_customer(tx, user_id, customer_id, deps.clock.now())
        session = await deps.stripe.create_checkout_session(
            CreateCheckoutInput(
                customer_id=customer_id,
                user_id=user_id,
                success_url=success_url,
                cancel_url=cancel_url,
                success_path=str(body["successPath"]),
                cancel_path=str(body["cancelPath"]),
                idempotency_key=f"checkout:{user_id}:{idempotency_key or new_id()}",
            )
        )
        deps.logger.info("stripe checkout opened", outcome="opened")
    return {"url": session["url"]}


async def open_portal(deps: BillingDeps, actor: Any) -> dict[str, str]:
    """EF-2 - the customer portal; a learner without a Stripe customer gets `NOT_FOUND`."""
    user_id = _require_user(actor)
    config = resolve_billing_config(deps.settings.billing_env())
    async with deps.db.service_tx() as tx:
        row = await queries.select_subscription(tx, user_id)
    if row is None or not can_open_portal(row.stripe_customer_id):
        raise AppError("NOT_FOUND", fr.NO_SUBSCRIPTION_TO_MANAGE)
    assert row.stripe_customer_id is not None  # narrowed by can_open_portal
    url = await deps.stripe.create_portal_session(
        CreatePortalInput(
            customer_id=row.stripe_customer_id,
            return_url=absolute_url(PORTAL_RETURN_PATH, config.app_url, "successPath"),
            return_path=PORTAL_RETURN_PATH,
        )
    )
    return {"url": url}


async def get_subscription(deps: BillingDeps, actor: Any) -> dict[str, Any]:
    """EF-3 - status and end of the current period; free by default (`status: 'none'`)."""
    user_id = _require_user(actor)
    async with deps.db.service_tx() as tx:
        row = await queries.select_subscription(tx, user_id)
    return {
        "status": "none" if row is None else row.status,
        "currentPeriodEnd": (
            None if row is None or row.current_period_end is None else to_iso(row.current_period_end)
        ),
    }
