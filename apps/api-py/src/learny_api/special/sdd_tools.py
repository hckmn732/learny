"""The `_dev` tooling endpoints of the SDD harness (port of `special/sdd-tools.ts`).

These three endpoints are not contract routes: they answer whatever the tooling page needs. This
module ports the secret scan (SPEC-002) and the simulated job run (SPEC-203, `demoJob`); the
commit-rule check (SPEC-002) stays `ts` and is documented in `evidence/SPEC-2207/handover.md`.
Outside `ENABLE_SDD_PAGES` every endpoint answers the bare 404 of `sddPagesEnabled`, before any
parsing.
"""

import json
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from fastapi import FastAPI, Request
from learny.shared.jsonx import dumps
from learny.shared.locale_fr.details import INVALID_REQUEST_TITLE
from learny.shared.locale_fr.dev_sdd_fixtures import SECRET_SCAN_SOURCE
from learny.shared.secret_scan import scan_text
from learny.shared.time import to_iso
from starlette.responses import Response

from learny_api.pipeline import PipelineContext
from learny_api.special.guards import empty_not_found, sdd_pages_enabled

if TYPE_CHECKING:
    from learny.shared.ownership import Ownership

SECRET_SCAN_PATH = "/api/v1/_dev/secret-scan"  # noqa: S105 - a route path, not a secret
SECRET_SCAN_KEY = "POST /api/v1/_dev/secret-scan"  # noqa: S105 - a contract key, not a secret
DEMO_JOB_PATH = "/api/v1/_dev/demo-job"
DEMO_JOB_KEY = "POST /api/v1/_dev/demo-job"
MAX_SECRET_TEXT = 20000
DEMO_RUN_ID_MAX = 64
DEMO_VALUE_MIN = -1_000_000
DEMO_VALUE_MAX = 1_000_000
DEMO_STEPS = ("validate-input", "persist-result")
PROBLEM_CONTENT_TYPE = "application/problem+json"
JSON_CONTENT_TYPE = "application/json"


def invalid_request() -> Response:
    """`invalidRequest`: the four-field problem body of the `_dev` tools, in this order."""
    body = {
        "type": "about:blank",
        "title": INVALID_REQUEST_TITLE,
        "status": 400,
        "code": "VALIDATION_FAILED",
    }
    return Response(content=dumps(body), status_code=400, headers={"content-type": PROBLEM_CONTENT_TYPE})


async def read_json(request: Request) -> Any:
    """`await request.json().catch(() => null)`: an unreadable body is simply absent."""
    try:
        return json.loads(await request.body())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None


async def secret_scan(request: Request, context: PipelineContext) -> Response:
    """`POST /api/v1/_dev/secret-scan` (SPEC-002): the findings of the scanned text."""
    if not sdd_pages_enabled(context.env):
        return empty_not_found()
    payload = await read_json(request)
    text = payload.get("text") if isinstance(payload, dict) else None
    if not isinstance(text, str) or len(text) > MAX_SECRET_TEXT:
        return invalid_request()
    body = {"findings": scan_text(text, SECRET_SCAN_SOURCE)}
    return Response(content=dumps(body), status_code=200, headers={"content-type": JSON_CONTENT_TYPE})


class _DemoStore:
    """The in-process `sddDemoStore` of the TypeScript harness: one record per `runId`."""

    def __init__(self) -> None:
        self._runs: dict[str, dict[str, Any]] = {}

    def find(self, run_id: str) -> dict[str, Any] | None:
        return self._runs.get(run_id)

    def insert(self, record: dict[str, Any]) -> None:
        self._runs[str(record["runId"])] = record

    def clear(self) -> None:
        self._runs.clear()


DEMO_STORE = _DemoStore()


def _shape(payload: Any) -> dict[str, Any] | None:
    """The loose route shape: `{runId: string <= 200, value: number}` (job bounds come later)."""
    if not isinstance(payload, dict):
        return None
    run_id = payload.get("runId")
    value = payload.get("value")
    if not isinstance(run_id, str) or len(run_id) > 200:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return {"runId": run_id, "value": value}


def _validated(data: dict[str, Any]) -> tuple[str, int] | None:
    """`demoJobInputSchema`: a trimmed non-empty run identifier and a bounded integer value."""
    run_id = str(data["runId"]).strip()
    value = data["value"]
    if not run_id or len(run_id) > DEMO_RUN_ID_MAX:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if float(value) != int(value):
        return None
    integer = int(value)
    if integer < DEMO_VALUE_MIN or integer > DEMO_VALUE_MAX:
        return None
    return run_id, integer


def _steps() -> list[dict[str, Any]]:
    return [{"name": name, "status": "pending", "attempts": 0} for name in DEMO_STEPS]


def _failed(steps: list[dict[str, Any]], code: str) -> dict[str, Any]:
    return {"status": "failed", "steps": steps, "result": None, "error": {"code": code}}


def run_demo_job(data: dict[str, Any], persisted_at: str) -> dict[str, Any]:
    """`runDemoJob` through `executeDirect`: the same steps, reports and idempotency."""
    steps = _steps()
    validated = _validated(data)
    if validated is None:
        return _failed(steps, "VALIDATION_FAILED")
    run_id, value = validated

    existing = DEMO_STORE.find(run_id)
    if existing is not None and existing["value"] != value:
        steps[0]["status"] = "failed"
        steps[0]["attempts"] = 1
        return _failed(steps, "IDEMPOTENCY_CONFLICT")

    steps[0]["status"] = "completed"
    steps[0]["attempts"] = 1
    doubled = value * 2
    if existing is not None:
        result = {"runId": run_id, "doubledValue": existing["doubledValue"]}
    else:
        result = {"runId": run_id, "doubledValue": doubled}
        DEMO_STORE.insert(
            {
                "runId": run_id,
                "value": value,
                "doubledValue": doubled,
                "persistedAt": persisted_at,
            }
        )
    steps[1]["status"] = "completed"
    steps[1]["attempts"] = 1
    return {"status": "completed", "steps": steps, "result": result, "error": None}


async def demo_job(request: Request, context: PipelineContext) -> Response:
    """`POST /api/v1/_dev/demo-job` (SPEC-203): the demonstration job, without Inngest."""
    if not sdd_pages_enabled(context.env):
        return empty_not_found()
    payload = await read_json(request)
    shaped = _shape(payload)
    if shaped is None:
        return invalid_request()
    persisted_at = to_iso(context.deps.clock.now())
    body = run_demo_job(shaped, persisted_at)
    return Response(
        content=dumps(body),
        status_code=200,
        headers={"content-type": JSON_CONTENT_TYPE, "cache-control": "no-store"},
    )


def install(app: FastAPI, context: PipelineContext, ownership: "Ownership") -> list[str]:
    """Registers the `py`-owned `_dev` endpoints; returns the installed special keys."""
    installed: list[str] = []
    if ownership.special.get(SECRET_SCAN_KEY) == "py":
        app.add_api_route(
            SECRET_SCAN_PATH,
            _endpoint(context),
            methods=["POST"],
            include_in_schema=False,
            name="special:sddSecretScan",
        )
        installed.append(SECRET_SCAN_KEY)
    if ownership.special.get(DEMO_JOB_KEY) == "py":
        app.add_api_route(
            DEMO_JOB_PATH,
            _demo_job_endpoint(context),
            methods=["POST"],
            include_in_schema=False,
            name="special:sddDemoJob",
        )
        installed.append(DEMO_JOB_KEY)
    return installed


def _demo_job_endpoint(context: PipelineContext) -> Callable[[Request], Awaitable[Response]]:
    async def endpoint(request: Request) -> Response:
        return await demo_job(request, context)

    endpoint.__name__ = "special_sdd_demo_job"
    return endpoint


def _endpoint(context: PipelineContext) -> Callable[[Request], Awaitable[Response]]:
    async def endpoint(request: Request) -> Response:
        return await secret_scan(request, context)

    endpoint.__name__ = "special_sdd_secret_scan"
    return endpoint
