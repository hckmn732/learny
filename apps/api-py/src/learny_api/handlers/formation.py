"""HTTP handlers of the formation context (SPEC-2201).

One `@handler("<route id>")` per operation, no logic: the body is the generated contract model and
the use case lives in `learny.formation`.
"""

from typing import Any, cast

from learny.formation import public as formation

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


# --- cadrage -------------------------------------------------------------------------------------


@handler("cadrage.page")
async def cadrage_page(call: Call) -> Any:
    return await formation.get_cadrage_page_state(call.deps, _actor(call), _params(call)["fid"])


@handler("cadrage.get")
async def cadrage_get(call: Call) -> Any:
    return await formation.get_cadrage_state(call.deps, _actor(call), _params(call)["fid"])


@handler("cadrage.message")
async def cadrage_message(call: Call) -> Any:
    return await formation.post_cadrage_message(call.deps, _actor(call), _params(call)["fid"], _body(call))


@handler("cadrage.complete")
async def cadrage_complete(call: Call) -> Any:
    return await formation.complete_cadrage(call.deps, _actor(call), _params(call)["fid"])


@handler("formations.list")
async def formations_list(call: Call) -> Any:
    return await formation.list_formations(call.deps, _actor(call))


@handler("formations.create")
async def formations_create(call: Call) -> Any:
    return await formation.create_formation(call.deps, _actor(call), _body(call))


@handler("formations.update")
async def formations_update(call: Call) -> Any:
    return await formation.update_formation_title(
        call.deps, _actor(call), _params(call)["fid"], _body(call, partial=True)
    )


# --- formation management ------------------------------------------------------------------------


@handler("formations.access")
async def formations_access(call: Call) -> Any:
    access = await formation.can_access_formation(call.deps, _actor(call), _params(call)["fid"])
    if not access:
        from learny.shared.errors import AppError
        from learny.shared.locale_fr.details import FORMATION_NOT_FOUND

        raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
    return None


@handler("formations.pause")
async def formations_pause(call: Call) -> Any:
    return await formation.pause_formation(
        call.deps, _actor(call), _params(call)["fid"], _body(call, partial=True)
    )


@handler("formations.archive")
async def formations_archive(call: Call) -> Any:
    return await formation.archive_formation(
        call.deps, _actor(call), _params(call)["fid"], _body(call, partial=True)
    )


@handler("formations.current")
async def formations_current(call: Call) -> Any:
    return await formation.switch_current_formation(call.deps, _actor(call), _body(call))


# --- shared formations ---------------------------------------------------------------------------


@handler("formations.group.get")
async def formations_group_get(call: Call) -> Any:
    return await formation.get_formation_group(call.deps, _actor(call), _params(call)["fid"])


@handler("formations.group.create")
async def formations_group_create(call: Call) -> Any:
    return await formation.create_formation_group(call.deps, _actor(call), _params(call)["fid"])


@handler("groups.rotateCode")
async def groups_rotate_code(call: Call) -> Any:
    return await formation.rotate_group_code(call.deps, _actor(call), _params(call)["gid"])


@handler("groups.members.remove")
async def groups_members_remove(call: Call) -> Any:
    params = _params(call)
    return await formation.remove_member_from_group(call.deps, _actor(call), params["gid"], params["uid"])


@handler("groups.leave")
async def groups_leave(call: Call) -> Any:
    return await formation.leave_formation_group(call.deps, _actor(call), _params(call)["gid"])


@handler("invitations.get")
async def invitations_get(call: Call) -> Any:
    return await formation.get_invitation_preview(call.deps, _params(call)["code"])


@handler("invitations.accept")
async def invitations_accept(call: Call) -> Any:
    return await formation.accept_invitation(call.deps, _actor(call), _params(call)["code"])


# --- programme -----------------------------------------------------------------------------------


@handler("programme.get")
async def programme_get(call: Call) -> Any:
    return await formation.get_programme_state(call.deps, _actor(call), _params(call)["fid"], _query(call))


@handler("programme.generate")
async def programme_generate(call: Call) -> Any:
    return await formation.generate_proposal(call.deps, _actor(call), _params(call)["fid"], _body(call))


@handler("programme.adjust")
async def programme_adjust(call: Call) -> Any:
    return await formation.adjust_proposal(call.deps, _actor(call), _params(call)["fid"], _body(call))


@handler("programme.import")
async def programme_import(call: Call) -> Any:
    return await formation.import_proposal(call.deps, _actor(call), _params(call)["fid"], _body(call))


@handler("programme.validate")
async def programme_validate(call: Call) -> Any:
    return await formation.validate_proposal(call.deps, _actor(call), _params(call)["fid"], _body(call))


# --- read models ---------------------------------------------------------------------------------


@handler("notionGraph.get")
async def notion_graph_get(call: Call) -> Any:
    return await formation.get_notion_graph(call.deps, _actor(call), _params(call)["fid"])


@handler("search.global")
async def search_global(call: Call) -> Any:
    query = _query(call)
    return await formation.search_user_content(
        call.deps, _actor(call), str(query["q"]), int(query.get("limit") or 10)
    )
