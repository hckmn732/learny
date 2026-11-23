"""Demonstrations of the SDD pages: the API coverage, the auth proxy and the Checkout session.

Port of `packages/api-routes/src/implementations/dev.ts` and of `devSddStripeCheckout`. The three
routes are guarded by `devRoutesEnabled` inside the handler, exactly like the TypeScript `guarded`.
"""

from typing import Any

from learny.billing import public as billing
from learny.platform.storage import STORAGE_BUCKETS, resource_path
from learny.shared.errors import AppError
from learny.shared.locale_fr import dev_sdd_fixtures as fixture

from learny_api.dev_demos.coverage import route_coverage, special_entries
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


# The demonstration job of the worker (SPEC-203): the page shows it and its retry budget. The page
# keeps the job identifier of the TypeScript registry (`DEMO_JOB_ID` of `@learny/jobs`), whatever the
# name of the Python consumer that runs it (`devtools.demo_job`).
DEMO_JOB_ID = "sdd-demo-job"
DEMO_JOB_RETRIES = 3


async def spec_007(call: Call) -> dict[str, Any]:
    """`devSddSpec007Demo`: the job registered under its identifier and its retries."""
    require_dev(call.deps)
    return {"ids": DEMO_JOB_ID, "retries": DEMO_JOB_RETRIES}


async def spec_1004(call: Call) -> dict[str, Any]:
    """`devSddSpec1004Demo`: the coverage of the contract tables and the special handlers."""
    require_dev(call.deps)
    return {"coverage": route_coverage(), "specials": special_entries()}


async def spec_110(call: Call) -> dict[str, Any]:
    """`devSddSpec110Demo`: the redacted owner-role snapshot of the credentials and billing."""
    require_dev(call.deps)
    return {
        "credentials": [dict(entry) for entry in fixture.CREDENTIALS],
        "tasks": [dict(entry) for entry in fixture.TASKS],
        "subscription": dict(fixture.SUBSCRIPTION),
    }


async def spec_114(call: Call) -> dict[str, Any]:
    """`devSddSpec114Demo`: the two private buckets and a resource object path."""
    require_dev(call.deps)
    return {
        "buckets": list(STORAGE_BUCKETS),
        "path": resource_path(fixture.DEMO_USER, fixture.DEMO_RESOURCE, fixture.DEMO_FILE_NAME),
    }


async def spec_1203(call: Call) -> dict[str, Any]:
    """`devSddSpec1203Demo`: the empty categories of the client dependency report."""
    require_dev(call.deps)
    return {
        "categories": {
            "pages": 0,
            "lib": 0,
            "components": 0,
            "dev": 0,
            "proxy": 0,
            "apiRoutes": 0,
        },
        "dependencies": list(fixture.DEPENDENCIES),
        "serverModules": 0,
    }
