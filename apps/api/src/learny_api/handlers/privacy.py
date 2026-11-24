"""HTTP handlers of the privacy context (SPEC-2206).

One `@handler("<route id>")` per operation, no logic: the body is the generated contract model and
the use case lives in `learny.privacy`. `me.export.read?download=1` answers a 302 to a fresh signed
URL.
"""

from typing import Any, cast

from learny.privacy import public as privacy
from starlette.responses import Response

from learny_api.pipeline import Call, handler


def _actor(call: Call) -> Any:
    """The pipeline guarantees an actor on a `user` route; this is only a typing cast."""
    return cast(Any, call.actor)


def _params(call: Call) -> dict[str, Any]:
    """The validated path parameters as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.params).model_dump())


@handler("me.deletion.schedule")
async def me_deletion_schedule(call: Call) -> Any:
    return await privacy.schedule_deletion(call.deps, _actor(call))


@handler("me.deletion.cancel")
async def me_deletion_cancel(call: Call) -> Any:
    await privacy.cancel_deletion(call.deps, _actor(call))
    return None


@handler("me.export.request")
async def me_export_request(call: Call) -> Any:
    return await privacy.request_export(call.deps, _actor(call))


@handler("me.export.read")
async def me_export_read(call: Call) -> Any:
    query = cast(Any, call.query)
    export_id = _params(call)["id"]
    if query is not None and query.download == "1":
        result = await privacy.download_export(call.deps, _actor(call), export_id)
        return Response(
            status_code=302,
            headers={"location": result["url"], "cache-control": "no-store"},
        )
    return await privacy.get_export(call.deps, _actor(call), export_id)
