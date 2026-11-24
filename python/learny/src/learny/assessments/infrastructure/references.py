"""Database resolver of brick references (SPEC-501 ET-8, BR-BRI-05).

Every query filters on the learner and the formation on top of RLS: no other user's notion, chunk,
resource or brick can be discovered through a validation error.
"""

from collections.abc import Sequence
from typing import Any

from learny.assessments.domain.bricks.validate import BrickResourceInfo
from learny.assessments.infrastructure import queries
from learny.shared.db.uow import Tx


class DbBrickReferenceResolver:
    """The four lookups the pure validation awaits, bound to one user transaction."""

    def __init__(self, tx: Tx, user_id: str, formation_id: str) -> None:
        self._tx = tx
        self._user_id = user_id
        self._formation_id = formation_id

    async def existing_notion_ids(self, formation_id: str, ids: Sequence[str]) -> set[str]:
        return await queries.resolve_existing_notion_ids(self._tx, self._user_id, formation_id, ids)

    async def chunks(self, ids: Sequence[str]) -> dict[str, dict[str, str]]:
        return await queries.resolve_chunks(self._tx, self._user_id, self._formation_id, ids)

    async def resources(self, ids: Sequence[str]) -> dict[str, BrickResourceInfo]:
        resolved = await queries.resolve_resources(self._tx, self._user_id, self._formation_id, ids)
        return {
            identifier: BrickResourceInfo(
                kind=info["kind"],
                pages=info["pages"],
                durationSec=info["durationSec"],
                deleted=info["deleted"],
            )
            for identifier, info in resolved.items()
        }

    async def existing_brick_ids(self, formation_id: str, ids: Sequence[str]) -> set[str]:
        return await queries.resolve_existing_brick_ids(self._tx, self._user_id, formation_id, ids)


def resolver_for(tx: Tx, user_id: str, formation_id: str) -> Any:
    """The resolver as the domain protocol sees it (its methods are awaitable, structural typing)."""
    return DbBrickReferenceResolver(tx, user_id, formation_id)


__all__ = ["DbBrickReferenceResolver", "resolver_for"]
