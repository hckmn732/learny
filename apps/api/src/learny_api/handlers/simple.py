"""HTTP handlers of simple mode (SPEC-4001 ET-1, ET-4).

One `@handler("<route id>")` per operation; the body is the generated contract model and the use case
lives in `learny.formation.application.simple`.
"""

from typing import Any, cast

from learny.formation import public as formation

from learny_api.guards.idempotency import read_idempotency_key
from learny_api.pipeline import Call, handler


def _actor(call: Call) -> Any:
    """The pipeline guarantees an actor on a `user` route; this is only a typing cast."""
    return cast(Any, call.actor)


def _body(call: Call) -> dict[str, Any]:
    return cast(dict[str, Any], cast(Any, call.body).model_dump())


def _params(call: Call) -> dict[str, Any]:
    return cast(dict[str, Any], cast(Any, call.params).model_dump())


@handler("formations.simple.create")
async def formations_simple_create(call: Call) -> Any:
    return await formation.create_simple_formation(call.deps, _actor(call), _body(call))


@handler("formations.simple.get")
async def formations_simple_get(call: Call) -> Any:
    return await _read_state(call)


async def _read_state(call: Call) -> Any:
    """The read model needs the caller's transaction; the use case exposes it through `deps`."""
    from learny.formation.application.simple.status import read_simple_state

    async with call.deps.db.user_tx(_actor(call)) as tx:
        return await read_simple_state(tx, _actor(call).user_id, _params(call)["fid"])


@handler("formations.simple.analysis")
async def formations_simple_analysis(call: Call) -> Any:
    return await formation.launch_analysis(call.deps, _actor(call), _params(call)["fid"])


@handler("sources.uploads.create")
async def sources_uploads_create(call: Call) -> Any:
    return await formation.create_simple_upload(
        call.deps,
        _actor(call),
        _params(call)["fid"],
        _body(call),
        read_idempotency_key(call.request.headers.get("idempotency-key")),
    )


@handler("sources.links.create")
async def sources_links_create(call: Call) -> Any:
    return await formation.create_simple_link(call.deps, _actor(call), _params(call)["fid"], _body(call))


@handler("resources.role")
async def resources_role(call: Call) -> Any:
    return await formation.set_resource_role(call.deps, _actor(call), _params(call)["rid"], _body(call))


@handler("diagnostic.create")
async def diagnostic_create(call: Call) -> Any:
    return await formation.create_diagnostic(call.deps, _actor(call), _params(call)["fid"])


@handler("diagnostic.skip")
async def diagnostic_skip(call: Call) -> Any:
    await formation.skip_diagnostic(call.deps, _actor(call), _params(call)["fid"])
    return None
