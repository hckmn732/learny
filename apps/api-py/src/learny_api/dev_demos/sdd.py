"""Demonstrations of the SDD pages: the API coverage, the auth proxy and the Checkout session.

Port of `packages/api-routes/src/implementations/dev.ts` and of `devSddStripeCheckout`. The three
routes are guarded by `devRoutesEnabled` inside the handler, exactly like the TypeScript `guarded`.
"""

from typing import Any

from learny.billing import public as billing
from learny.shared.errors import AppError

from learny_api.dev_demos.guard import require_dev
from learny_api.pipeline import Call


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


# The demonstration job of the worker (SPEC-203): the page shows it and its retry budget. The page
# keeps the job identifier of the TypeScript registry (`DEMO_JOB_ID` of `@learny/jobs`), whatever the
# name of the Python consumer that runs it (`devtools.demo_job`).
DEMO_JOB_ID = "sdd-demo-job"
DEMO_JOB_RETRIES = 3
