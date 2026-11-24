"""Creation of a simple-mode formation (SPEC-4001 EF-1; BR-FOR-01, BR-FOR-02, ADR-4003).

The formation is created at the `cadrage` status with the provisional title and its single analysis
row; no scoping conversation is started, no model is called.
"""

from collections.abc import Mapping
from typing import Any

from learny.formation.application.ports import FormationDeps
from learny.formation.application.simple.status import read_simple_state, steps_json
from learny.formation.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import simple as texts
from learny.shared.locale_fr.details import FORMATION_NOT_FOUND, PROFILE_NOT_FOUND, SIMPLE_NOT_SIMPLE
from learny.shared.naming import formation_monogram, next_accent


def require_simple_mode(formation: Mapping[str, Any]) -> None:
    """ET-2 - a simple-mode operation never applies to a tutor-mode formation."""
    if str(formation.get("creation_mode")) != "simple":
        raise AppError("SIMPLE_NOT_SIMPLE", SIMPLE_NOT_SIMPLE, status=409)


async def require_simple_formation(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any]:
    """The formation of the caller, or `NOT_FOUND`; a tutor-mode one is refused."""
    formation = await queries.read_simple_formation(tx, user_id, formation_id)
    if formation is None:
        raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
    require_simple_mode(formation)
    return formation


async def create_simple_formation(
    deps: FormationDeps, actor: Actor, body: Mapping[str, Any]
) -> dict[str, Any]:
    """`POST /formations/simple` (EF-1): the provisional formation and its analysis line."""
    motivation = body.get("motivation")
    async with deps.db.user_tx(actor) as tx:
        account = await queries.read_owner_account(tx, actor.user_id)
        if account is None:
            raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
        used = await queries.read_used_accents(tx, actor.user_id)
        title = texts.DEFAULT_TITLE
        formation_id = await queries.insert_simple_formation(
            tx,
            actor.user_id,
            title=title,
            motivation=str(motivation) if motivation is not None else None,
            language=str(account["course_language"]),
            monogram=formation_monogram(title),
            accent=next_accent(used),
        )
        if formation_id is None:
            raise AppError("INTERNAL_ERROR", FORMATION_NOT_FOUND)
        await queries.insert_simple_analysis(tx, formation_id, actor.user_id, steps_json())
        state = await read_simple_state(tx, actor.user_id, formation_id)
        return state
