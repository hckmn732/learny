"""Development demonstrations of SPEC-210: simulated Checkout, failures and webhook history."""

from typing import Any

from learny.billing.public import (
    cancel_mock_checkout,
    list_stripe_events,
    pay_mock_checkout,
    simulate_stripe_action,
)
from learny.shared.errors import AppError
from learny.shared.locale_fr import billing as fr

from learny_api.pipeline import Call


def _actor(call: Call) -> Any:
    if call.actor is None:
        raise AppError("UNAUTHENTICATED", fr.UNAUTHENTICATED)
    return call.actor


async def checkout_cancel(call: Call) -> dict[str, Any]:
    body: Any = call.body
    return await cancel_mock_checkout(call.deps, _actor(call), str(body.sessionId))


async def checkout_pay(call: Call) -> dict[str, Any]:
    body: Any = call.body
    return await pay_mock_checkout(call.deps, _actor(call), str(body.sessionId))


async def events(call: Call) -> dict[str, Any]:
    return await list_stripe_events(call.deps, _actor(call))


async def simulate(call: Call) -> dict[str, Any]:
    body: Any = call.body
    return await simulate_stripe_action(call.deps, _actor(call), body.action)
