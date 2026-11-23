"""Simulation of the Stripe journey for the demonstration pages (SPEC-210 EF-7, EF-8).

Port of `packages/services/src/billing/dev.ts`. Only the simulated gateway supports it; every
function refuses another mode. The webhook is delivered through `handle_webhook`, so signature,
deduplication and ordering are exercised for real.
"""

from typing import Any, Literal, cast

from learny.billing.application.ports import BillingDeps
from learny.billing.application.webhook import handle_webhook
from learny.platform.stripe import MockCheckoutSession, MockDelivery, MockStripeGateway, is_mock_gateway
from learny.shared.errors import AppError
from learny.shared.locale_fr import billing as fr

SimulatedAction = Literal["payment-failed", "cancel", "replay"]


def _require_user(actor: Any) -> str:
    user_id = getattr(actor, "user_id", None)
    if not isinstance(user_id, str) or user_id == "":
        raise AppError("UNAUTHENTICATED", fr.UNAUTHENTICATED)
    return user_id


def mock_gateway(deps: BillingDeps) -> MockStripeGateway:
    """`mockContext`: the simulated gateway, or a CONFLICT for every other mode."""
    if not is_mock_gateway(deps.stripe):
        raise AppError("CONFLICT", fr.SIMULATION_UNAVAILABLE)
    return cast(MockStripeGateway, deps.stripe)


async def _deliver(deps: BillingDeps, delivery: MockDelivery) -> str:
    outcome = await handle_webhook(deps, delivery.payload, delivery.signature)
    return outcome.result


async def get_mock_checkout_session(deps: BillingDeps, session_id: str) -> MockCheckoutSession | None:
    """The session shown by the simulated page, or `None` once the process restarted."""
    return mock_gateway(deps).get_checkout_session(session_id)


async def pay_mock_checkout(deps: BillingDeps, actor: Any, session_id: str) -> dict[str, Any]:
    """Pay - completes the session, delivers the signed webhook, returns where to go."""
    user_id = _require_user(actor)
    gateway = mock_gateway(deps)
    session = gateway.get_checkout_session(session_id)
    if session is None or session.user_id != user_id:
        raise AppError("NOT_FOUND", fr.SESSION_NOT_FOUND)
    await _deliver(deps, gateway.complete_checkout(session_id))
    return {"redirectTo": session.success_path}


async def cancel_mock_checkout(deps: BillingDeps, actor: Any, session_id: str) -> dict[str, Any]:
    """Cancel - abandons the session and sends the learner back."""
    user_id = _require_user(actor)
    gateway = mock_gateway(deps)
    session = gateway.get_checkout_session(session_id)
    if session is None or session.user_id != user_id:
        raise AppError("NOT_FOUND", fr.SESSION_NOT_FOUND)
    gateway.cancel_checkout(session_id)
    return {"redirectTo": session.cancel_path}


async def simulate_stripe_action(
    deps: BillingDeps,
    actor: Any,
    action: SimulatedAction,
) -> dict[str, Any]:
    """EF-8 - failed payment, cancellation, or replay of the learner's last webhook."""
    user_id = _require_user(actor)
    gateway = mock_gateway(deps)
    if action == "replay":
        journal = deps.webhook_journal
        last = None if journal is None else journal.last(user_id)
        if last is None:
            raise AppError("NOT_FOUND", fr.NO_WEBHOOK_TO_REPLAY)
        delivery = MockDelivery(
            event_id=last.event_id,
            type=last.type,
            created=0,
            payload=last.payload,
            signature=gateway.sign(last.payload),
        )
        return {"result": await _deliver(deps, delivery)}
    subscription = next(
        (item for item in gateway.state.subscriptions.values() if item.user_id == user_id),
        None,
    )
    if subscription is None:
        raise AppError("NOT_FOUND", fr.NO_SIMULATED_SUBSCRIPTION)
    delivery = (
        gateway.fail_payment(subscription.id)
        if action == "payment-failed"
        else gateway.cancel_subscription(subscription.id)
    )
    return {"result": await _deliver(deps, delivery)}


async def list_stripe_events(deps: BillingDeps, actor: Any) -> dict[str, Any]:
    """EF-8 - the learner's webhook history (the simulated mode keeps it in memory)."""
    user_id = _require_user(actor)
    mock_gateway(deps)
    journal = deps.webhook_journal
    entries = [] if journal is None else journal.list(user_id)
    return {
        "items": [
            {"eventId": entry.event_id, "type": entry.type, "at": entry.at, "result": entry.result}
            for entry in entries
        ]
    }
