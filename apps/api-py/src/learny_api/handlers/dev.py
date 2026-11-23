"""[SPEC-2207] Thin adapters of the `dev.*` operations kept as e2e harness (no logic, ADR-2041).

Only the simulated Stripe checkout, the e-mail outbox, the reminder generation and the worker
demonstration event remain; the SDD demonstration operations are retired. The special registry
wraps these handlers with the development guard, so they are never served in production.
"""

from typing import Any

from learny_api.dev_demos import notifications, sdd
from learny_api.pipeline import Call, handler
from learny_api.special import dev_email, dev_events, dev_stripe


@handler("dev.email.outbox")
async def email_outbox(call: Call) -> dict[str, Any]:
    return await dev_email.outbox(call)


@handler("dev.email.outbox.purge")
async def email_outbox_purge(call: Call) -> dict[str, Any]:
    return await dev_email.purge(call)


@handler("dev.stripe.checkoutCancel")
async def stripe_checkout_cancel(call: Call) -> dict[str, Any]:
    return await dev_stripe.checkout_cancel(call)


@handler("dev.stripe.checkoutPay")
async def stripe_checkout_pay(call: Call) -> dict[str, Any]:
    return await dev_stripe.checkout_pay(call)


@handler("dev.events.demo.run")
async def events_demo_run(call: Call) -> dict[str, Any]:
    return await dev_events.run(call)


@handler("dev.events.demo.start")
async def events_demo_start(call: Call) -> dict[str, Any]:
    return await dev_events.start(call)


@handler("dev.notificationsGenerate")
async def dev_notifications_generate(call: Call) -> dict[str, Any]:
    return await notifications.generate(call)


@handler("dev.sdd.stripe.session")
async def dev_sdd_stripe_session(call: Call) -> dict[str, Any]:
    return await sdd.stripe_session(call)


@handler("dev.stripe.simulate")
async def stripe_simulate(call: Call) -> dict[str, Any]:
    return await dev_stripe.simulate(call)
