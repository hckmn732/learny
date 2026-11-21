"""HTTP handlers of the identity context (SPEC-2201).

One `@handler("<route id>")` per operation, no logic: the body is the generated contract model and
the use case lives in `learny.identity` (or in the read-only `learny.views`).
"""

from typing import Any, cast

from learny.identity import public as identity
from learny.views import header as header_view
from learny.views import sidebar as sidebar_view

from learny_api.pipeline import Call, handler


def _actor(call: Call) -> identity.Actor:
    """The pipeline guarantees an actor on a `user` route; this is only a typing cast."""
    return cast(identity.Actor, call.actor)


def _body(call: Call, *, partial: bool = False) -> dict[str, Any]:
    """The validated body as a plain mapping; `partial` keeps only the fields the caller sent."""
    return cast(dict[str, Any], cast(Any, call.body).model_dump(exclude_unset=partial))


@handler("me.get")
async def me_get(call: Call) -> Any:
    return await identity.get_me(call.deps, _actor(call))


@handler("me.update")
async def me_update(call: Call) -> Any:
    return await identity.update_profile(call.deps, _actor(call), _body(call, partial=True))


@handler("me.preferences.get")
async def me_preferences_get(call: Call) -> Any:
    return await identity.get_preferences(call.deps, _actor(call))


@handler("me.preferences.update")
async def me_preferences_update(call: Call) -> Any:
    return await identity.update_preferences(call.deps, _actor(call), _body(call))


@handler("me.onboarding.get")
async def me_onboarding_get(call: Call) -> Any:
    return await identity.get_onboarding_state(call.deps, _actor(call))


@handler("me.onboarding.update")
async def me_onboarding_update(call: Call) -> Any:
    return await identity.advance_onboarding(call.deps, _actor(call), _body(call, partial=True))


@handler("me.profile.get")
async def me_profile_get(call: Call) -> Any:
    return await identity.get_settings_state(call.deps, _actor(call))


@handler("me.profile.update")
async def me_profile_update(call: Call) -> Any:
    return await identity.update_settings_profile(call.deps, _actor(call), _body(call, partial=True))


@handler("me.legal.accept")
async def me_legal_accept(call: Call) -> Any:
    return await identity.accept_legal_versions(call.deps, _actor(call), _body(call))


@handler("me.ai.task-models.update")
async def me_ai_task_models_update(call: Call) -> Any:
    return await identity.assign_task_model(call.deps, _actor(call), _body(call))


@handler("header.get")
async def header_get(call: Call) -> Any:
    return await header_view.get_header(call.deps, _actor(call))


@handler("sidebar.get")
async def sidebar_get(call: Call) -> Any:
    return await sidebar_view.get_sidebar(call.deps, _actor(call))


@handler("sidebar.update")
async def sidebar_update(call: Call) -> Any:
    return await identity.update_sidebar(call.deps, _actor(call), _body(call, partial=True))
