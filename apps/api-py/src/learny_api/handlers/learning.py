"""HTTP handlers of the learning context (SPEC-2202).

One `@handler("<route id>")` per operation, no logic: the body is the generated contract model and
the use case lives in `learny.learning`.
"""

from typing import Any, cast

from learny.learning import public as learning

from learny_api.pipeline import Call, handler


def _actor(call: Call) -> Any:
    """The pipeline guarantees an actor on a `user` route; this is only a typing cast."""
    return cast(Any, call.actor)


def _params(call: Call) -> dict[str, Any]:
    """The validated path parameters as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.params).model_dump())


def _query(call: Call) -> dict[str, Any]:
    """The validated query string as a plain mapping, defaults included."""
    return cast(dict[str, Any], cast(Any, call.query).model_dump())


# --- series --------------------------------------------------------------------------------------


@handler("series.streak")
async def series_streak(call: Call) -> Any:
    return await learning.get_streak(call.deps, _actor(call))


@handler("series.milestones")
async def series_milestones(call: Call) -> Any:
    return await learning.get_milestones(call.deps, _actor(call), _query(call).get("formationId"))
