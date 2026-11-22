"""[SPEC-2207] Thin adapters of the `dev.*` operations (no logic).

Each handler forwards to the development use case of its family. The special registry wraps these
same handlers with the development guard, so a call is served exactly like `devRoute` in
`packages/api-routes/src/special/dev-routes.ts`.
"""

from typing import Any

from learny_api.pipeline import Call, handler
from learny_api.special import dev_echo, dev_email, dev_rate_limit, dev_stripe


@handler("dev.echo")
async def echo(call: Call) -> dict[str, Any]:
    return await dev_echo.echo(call)


@handler("dev.items")
async def items(call: Call) -> dict[str, Any]:
    return await dev_echo.items(call)


@handler("dev.rateLimit.burst")
async def rate_limit_burst(call: Call) -> dict[str, Any]:
    return await dev_rate_limit.burst(call)


@handler("dev.rateLimit.origin")
async def rate_limit_origin(call: Call) -> dict[str, Any]:
    return await dev_rate_limit.origin(call)


@handler("dev.rateLimit.purge")
async def rate_limit_purge(call: Call) -> dict[str, Any]:
    return await dev_rate_limit.purge_demo(call)


@handler("dev.email.outbox")
async def email_outbox(call: Call) -> dict[str, Any]:
    return await dev_email.outbox(call)


@handler("dev.email.outbox.purge")
async def email_outbox_purge(call: Call) -> dict[str, Any]:
    return await dev_email.purge(call)


@handler("dev.email.preview")
async def email_preview(call: Call) -> Any:
    return await dev_email.preview(call)


@handler("dev.email.send")
async def email_send(call: Call) -> dict[str, Any]:
    return await dev_email.send(call)


@handler("dev.stripe.checkoutCancel")
async def stripe_checkout_cancel(call: Call) -> dict[str, Any]:
    return await dev_stripe.checkout_cancel(call)


@handler("dev.stripe.checkoutPay")
async def stripe_checkout_pay(call: Call) -> dict[str, Any]:
    return await dev_stripe.checkout_pay(call)


@handler("dev.stripe.events")
async def stripe_events(call: Call) -> dict[str, Any]:
    return await dev_stripe.events(call)


@handler("dev.stripe.simulate")
async def stripe_simulate(call: Call) -> dict[str, Any]:
    return await dev_stripe.simulate(call)
