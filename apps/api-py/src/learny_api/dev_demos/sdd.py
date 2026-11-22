"""Demonstrations of the SDD pages: the API coverage, the auth proxy and the Checkout session.

Port of `packages/api-routes/src/implementations/dev.ts` and of `devSddStripeCheckout`. The three
routes are guarded by `devRoutesEnabled` inside the handler, exactly like the TypeScript `guarded`.
"""

from typing import Any

from learny.billing import public as billing
from learny.shared.errors import AppError

from learny_api.dev_demos.coverage import route_coverage
from learny_api.dev_demos.guard import require_dev
from learny_api.pipeline import Call


async def api_coverage(call: Call) -> dict[str, Any]:
    """`devSddApiCoverage`: the coverage of the contract tables, development only."""
    require_dev(call.deps)
    return route_coverage()


async def auth_proxy(call: Call) -> dict[str, Any]:
    """`devSddAuthProxy`: the proxy answers, proving the relay kept the cookies."""
    require_dev(call.deps)
    return {"ok": True}


async def stripe_session(call: Call) -> dict[str, Any]:
    """`devSddStripeCheckout`: an open simulated session of this identifier, or nothing."""
    require_dev(call.deps)
    body: Any = call.body
    session_id = None if body is None else getattr(body, "id", None)
    if session_id is None:
        return {"sessionId": None}
    try:
        session = await billing.get_mock_checkout_session(call.deps, str(session_id))
    except AppError as error:
        if error.code == "CONFLICT":
            return {"sessionId": None}
        raise
    return {"sessionId": str(session_id) if session is not None and session.status == "open" else None}
