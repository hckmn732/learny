"""HTTP handlers of the billing context (SPEC-2206).

One `@handler("<route id>")` per operation, no logic: the body is the generated contract model and
the use case lives in `learny.billing`. `billing.webhook` is a public route authenticated by the
`Stripe-Signature` header of the raw body, so it reads the bytes itself (a parsed body would break
the signature) and caps them like the TypeScript handler.
"""

from typing import Any, cast

from learny.billing import public as billing

from learny_api.pipeline import Call, handler

MAX_WEBHOOK_BYTES = 1024 * 1024


def _actor(call: Call) -> Any:
    """The pipeline guarantees an actor on a `user` route; this is only a typing cast."""
    return cast(Any, call.actor)


def _body(call: Call) -> dict[str, Any]:
    """The validated body as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.body).model_dump())


@handler("billing.checkout")
async def billing_checkout(call: Call) -> Any:
    return await billing.start_checkout(
        call.deps, _actor(call), _body(call), call.request.headers.get("idempotency-key")
    )


@handler("billing.portal")
async def billing_portal(call: Call) -> Any:
    return await billing.open_portal(call.deps, _actor(call))


@handler("billing.subscription")
async def billing_subscription(call: Call) -> Any:
    return await billing.get_subscription(call.deps, _actor(call))


@handler("billing.webhook")
async def billing_webhook(call: Call) -> Any:
    raw = await call.request.body()
    if len(raw) > MAX_WEBHOOK_BYTES:
        from learny.shared.errors import AppError
        from learny.shared.locale_fr.details import PAYLOAD_TOO_LARGE

        raise AppError("PAYLOAD_TOO_LARGE", PAYLOAD_TOO_LARGE)
    outcome = await billing.handle_webhook(
        call.deps,
        raw.decode("utf-8", errors="replace"),
        call.request.headers.get("stripe-signature"),
    )
    return {"received": True, "result": outcome.result}
