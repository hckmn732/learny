"""Sidebar read view of the application shell (SPEC-304; SPEC-2201).

`learny.views` only exposes read-only aggregations. The sidebar read is implemented once, in the
identity context (`learny.identity.application.sidebar.read_sidebar`, via `public`), because
`PATCH /me/sidebar` writes the profile and must return that very DTO in the same transaction; this
module is the stable entry point the HTTP handlers use.
"""

from typing import Any

from learny.identity.application.ports import IdentityDeps
from learny.identity.domain.actor import Actor
from learny.identity.public import get_sidebar as _get_sidebar

__all__ = ["get_sidebar"]


async def get_sidebar(deps: IdentityDeps, actor: Actor) -> dict[str, Any]:
    """`GET /api/v1/me/sidebar` - menu data of the authenticated learner."""
    return await _get_sidebar(deps, actor)
