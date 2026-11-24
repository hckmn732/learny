"""Declare a chapter's contributions finished, or reopen it (BR-APP-04, SPEC-607 EF-4, ET-2).

One transaction serialises the transition per learner and chapter, updates `chapter_progress` and
enqueues `chapter/contributions-completed` only when the module becomes complete. The event
identifier is deterministic for the completion version, so replaying a committed request cannot
request a second generation. Reopening a chapter never generates anything.
"""

from typing import Any

from learny.content.application.ports import ContentDeps
from learny.content.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.time import to_iso

CHAPTER_LOCK_NAMESPACE = 607


def _status_of(value: Any) -> str:
    return "done" if value == "done" else "in_progress"


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value if isinstance(value, str) else to_iso(value)


async def chapter_counts(tx: Tx, user_id: str, module_id: str) -> tuple[int, int]:
    """The chapters of the module and how many are done for this learner."""
    found = await queries.one(tx, queries.CHAPTER_COUNTS, {"user_id": user_id, "module_id": module_id})
    if found is None:
        return (0, 0)
    return (int(found["total"]), int(found["done"]))


async def complete_chapter(
    deps: ContentDeps, actor: Actor, chapter_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    """EF-4, CL-5: mark the chapter done or reopen it, emitting the event once."""
    async with deps.db.user_tx(actor) as tx:
        chapter = await queries.one(
            tx,
            queries.SELECT_CHAPTER_FOR_COMPLETION,
            {"id": chapter_id, "user_id": actor.user_id},
        )
        if chapter is None:
            raise AppError("NOT_FOUND", texts.CHAPTER_NOT_FOUND)
        if chapter["module_status"] == "locked":
            raise AppError("FORBIDDEN", texts.MODULE_LOCKED_NOTICE)
        module_id = str(chapter["module_id"])
        await queries.execute(tx, queries.LOCK_CHAPTER, {"key": f"{actor.user_id}:{chapter_id}"})
        current = await queries.one(
            tx,
            queries.SELECT_CHAPTER_PROGRESS,
            {"user_id": actor.user_id, "chapter_id": chapter_id},
        )
        target = "done" if body.get("done") else "in_progress"
        counts_before = await chapter_counts(tx, actor.user_id, module_id)
        if _status_of(current.get("contributions_status") if current else None) == target:
            return {
                "chapterId": chapter_id,
                "moduleId": module_id,
                "contributionsStatus": target,
                "doneAt": _iso(current.get("done_at") if current else None),
                "chaptersDone": counts_before[1],
                "chaptersTotal": counts_before[0],
                "generationRequested": False,
            }
        now = deps.clock.now()
        await queries.execute(
            tx,
            queries.UPSERT_CHAPTER_PROGRESS,
            {
                "user_id": actor.user_id,
                "chapter_id": chapter_id,
                "status": target,
                "done_at": to_iso(now) if target == "done" else None,
                "now": to_iso(now),
            },
        )
        total, done = await chapter_counts(tx, actor.user_id, module_id)
        all_done = total > 0 and done == total
        if target == "done" and all_done:
            resources = await queries.one(
                tx,
                queries.COUNT_FORMATION_RESOURCES,
                {"user_id": actor.user_id, "formation_id": str(chapter["formation_id"])},
            )
            version = f"{done}:{int(resources['total']) if resources else 0}"
            await tx.emit(
                "chapter/contributions-completed",
                {
                    "userId": actor.user_id,
                    "moduleId": module_id,
                    "chapterId": chapter_id,
                    "force": False,
                },
                event_id=f"course-generation:{module_id}:auto:{version}",
            )
        return {
            "chapterId": chapter_id,
            "moduleId": module_id,
            "contributionsStatus": target,
            "doneAt": to_iso(now) if target == "done" else None,
            "chaptersDone": done,
            "chaptersTotal": total,
            "generationRequested": target == "done" and all_done,
        }
