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


def _body(call: Call, *, partial: bool = False) -> dict[str, Any]:
    """The validated body as a plain mapping; `partial` keeps only the fields the caller sent."""
    return cast(dict[str, Any], cast(Any, call.body).model_dump(exclude_unset=partial))


def _params(call: Call) -> dict[str, Any]:
    """The validated path parameters as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.params).model_dump())


def _query(call: Call) -> dict[str, Any]:
    """The validated query string as a plain mapping, defaults included."""
    return cast(dict[str, Any], cast(Any, call.query).model_dump())


# --- agenda --------------------------------------------------------------------------------------


@handler("agenda.get")
async def agenda_get(call: Call) -> Any:
    query = _query(call)
    return await learning.get_agenda(
        call.deps,
        _actor(call),
        {"formation": query["formation"], "from": query["from_"], "to": query["to"]},
    )


@handler("gaps.list")
async def gaps_list(call: Call) -> Any:
    nature = _query(call).get("nature")
    return await learning.list_gaps(
        call.deps,
        _actor(call),
        _params(call)["fid"],
        None if nature is None else str(getattr(nature, "value", nature)),
    )


# --- series --------------------------------------------------------------------------------------


@handler("series.streak")
async def series_streak(call: Call) -> Any:
    return await learning.get_streak(call.deps, _actor(call))


@handler("series.milestones")
async def series_milestones(call: Call) -> Any:
    return await learning.get_milestones(call.deps, _actor(call), _query(call).get("formationId"))


# --- final review --------------------------------------------------------------------------------


@handler("formations.finalReview")
async def formations_final_review(call: Call) -> Any:
    return await learning.get_final_review(call.deps, _actor(call), _params(call)["fid"])


@handler("formations.maintenance")
async def formations_maintenance(call: Call) -> Any:
    return await learning.set_maintenance(call.deps, _actor(call), _params(call)["fid"], _body(call))


# --- agenda replan -------------------------------------------------------------------------------


@handler("slots.alternatives")
async def slots_alternatives(call: Call) -> Any:
    return await learning.get_slot_alternatives(call.deps, _actor(call), _params(call)["sid"])


@handler("slots.move")
async def slots_move(call: Call) -> Any:
    return await learning.move_slot(call.deps, _actor(call), _params(call)["sid"], _body(call))


@handler("formations.replan-options")
async def formations_replan_options(call: Call) -> Any:
    return await learning.get_replan_options(call.deps, _actor(call), _params(call)["fid"])


@handler("formations.replan")
async def formations_replan(call: Call) -> Any:
    body = _body(call)
    body["choice"] = getattr(body["choice"], "value", body["choice"])
    return await learning.apply_replan(call.deps, _actor(call), _params(call)["fid"], body)


# --- warmups -------------------------------------------------------------------------------------


@handler("warmups.today.get")
async def warmups_today_get(call: Call) -> Any:
    return await learning.get_today_warmups(call.deps, _actor(call))
