"""Development demonstrations of SPEC-204: preview, send and memory outbox (thin routes).

The preview answers HTML unless the client asks for JSON, exactly like `wantsJson`.
"""

from typing import Any

from learny.engagement.public import (
    list_demo_outbox,
    preview_email,
    purge_demo_outbox,
    send_demo_email,
)
from starlette.requests import Request
from starlette.responses import Response

from learny_api.pipeline import Call

HTML_HEADERS = {"content-type": "text/html; charset=utf-8", "cache-control": "no-store"}


def wants_json(request: Request) -> bool:
    """`wantsJson`: `Accept: application/json` wins; browsers and mail clients get HTML."""
    accept = request.headers.get("accept") or ""
    return "application/json" in accept and "text/html" not in accept


async def preview(call: Call) -> Any:
    query: Any = call.query
    document = await preview_email(
        call.deps,
        template=str(query.template),
        tone=str(query.tone),
        user_id=call.user_id,
    )
    if wants_json(call.request):
        return document
    return Response(document["html"], status_code=200, headers=dict(HTML_HEADERS))


async def send(call: Call) -> dict[str, Any]:
    body: Any = call.body
    return await send_demo_email(
        call.deps,
        user_id=call.user_id,
        template=str(body.template),
        tone=str(body.tone),
    )


async def outbox(call: Call) -> dict[str, Any]:
    return list_demo_outbox(call.deps)


async def purge(call: Call) -> dict[str, Any]:
    return purge_demo_outbox(call.deps)
