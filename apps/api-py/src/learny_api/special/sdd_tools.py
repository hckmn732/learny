"""The `_dev` tooling endpoints of the SDD harness (port of `special/sdd-tools.ts`).

These three endpoints are not contract routes: they answer whatever the tooling page needs. This
slice ports the secret scan (SPEC-002); the simulated job run (SPEC-203) and the commit-rule check
(SPEC-002) stay `ts` and are documented in `evidence/SPEC-2207/handover.md`. Outside
`ENABLE_SDD_PAGES` every endpoint answers the bare 404 of `sddPagesEnabled`, before any parsing.
"""

import json
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from fastapi import FastAPI, Request
from learny.shared.jsonx import dumps
from learny.shared.locale_fr.details import INVALID_REQUEST_TITLE
from learny.shared.locale_fr.dev_sdd_fixtures import SECRET_SCAN_SOURCE
from learny.shared.secret_scan import scan_text
from starlette.responses import Response

from learny_api.pipeline import PipelineContext
from learny_api.special.guards import empty_not_found, sdd_pages_enabled

if TYPE_CHECKING:
    from learny.shared.ownership import Ownership

SECRET_SCAN_PATH = "/api/v1/_dev/secret-scan"  # noqa: S105 - a route path, not a secret
SECRET_SCAN_KEY = "POST /api/v1/_dev/secret-scan"  # noqa: S105 - a contract key, not a secret
MAX_SECRET_TEXT = 20000
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


def install(app: FastAPI, context: PipelineContext, ownership: "Ownership") -> list[str]:
    """Registers the `py`-owned `_dev` endpoints; returns the installed special keys."""
    if ownership.special.get(SECRET_SCAN_KEY) != "py":
        return []
    app.add_api_route(
        SECRET_SCAN_PATH,
        _endpoint(context),
        methods=["POST"],
        include_in_schema=False,
        name="special:sddSecretScan",
    )
    return [SECRET_SCAN_KEY]


def _endpoint(context: PipelineContext) -> Callable[[Request], Awaitable[Response]]:
    async def endpoint(request: Request) -> Response:
        return await secret_scan(request, context)

    endpoint.__name__ = "special_sdd_secret_scan"
    return endpoint
