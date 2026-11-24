"""Generate the course now (BR-APP-04, SPEC-607 EF-4, ET-2).

An explicit demand is accepted even while a chapter is still open, the event carries `force`, and
its identifier covers the completion version so a repeated click cannot request a second generation.
A locked module is refused.
"""

from typing import Any

from learny.content.application.ports import ContentDeps
from learny.content.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts


async def generate_course_now(deps: ContentDeps, actor: Actor, module_id: str) -> dict[str, Any]:
    """Accepts the demand and enqueues `chapter/contributions-completed` with `force`."""
    async with deps.db.user_tx(actor) as tx:
        access = await queries.one(
            tx, queries.SELECT_GENERATION_ACCESS, {"id": module_id, "user_id": actor.user_id}
        )
        if access is None:
            raise AppError("NOT_FOUND", texts.MODULE_NOT_FOUND)
        if access["module_status"] == "locked":
            raise AppError("FORBIDDEN", texts.MODULE_LOCKED_NOTICE)
        version = (
            f"{int(access['chapters_done'])}:{int(access['chapters_total'])}:{int(access['resource_count'])}"
        )
        await tx.emit(
            "chapter/contributions-completed",
            {
                "userId": actor.user_id,
                "moduleId": module_id,
                "chapterId": None,
                "force": True,
            },
            event_id=f"course-generation:{module_id}:force:{version}",
        )
        return {"moduleId": module_id, "requested": True}
