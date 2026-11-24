"""HTTP handler of the home screen (SPEC-603, SPEC-2302).

One `@handler("home.get")` for the read-only aggregation of `learny.views.home`: no logic here, the
use case opens the learner's transaction and the pipeline validates the answer.
"""

from typing import Any, cast

from learny.views import home as home_view

from learny_api.pipeline import Call, handler


def _actor(call: Call) -> Any:
    """The pipeline guarantees an actor on a `user` route; this is only a typing cast."""
    return cast(Any, call.actor)


@handler("home.get")
async def home_get(call: Call) -> Any:
    return await home_view.get_home(call.deps, _actor(call))
