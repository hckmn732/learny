"""Read model of the progressive generation (SPEC-4001 EF-9, EF-12).

The consumer discovers the modules that still need a course; the worker generates the first two
directly and enqueues the others with the ordinary course event.
"""

from collections.abc import Mapping
from typing import Any

from learny.formation.application.ports import FormationDeps
from learny.formation.infrastructure import queries


async def list_generation_modules(deps: FormationDeps, formation_id: str) -> list[Mapping[str, Any]]:
    """The modules of the formation and the current course status of each."""
    async with deps.db.service_tx() as tx:
        return await queries.list_generation_modules(tx, formation_id)
