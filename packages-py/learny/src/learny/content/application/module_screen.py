"""Read model of the module screen (SCR-06, SPEC-607 EF-1 to EF-5, BR-APP-04, BR-NAP-04).

Everything runs in the learner's RLS transaction, so another owner's formation is the same NOT_FOUND
as an unknown one. The selected chapter comes from `?chapitre=` when it belongs to the module,
otherwise the first chapter still in progress. Statuses, pages and sizes come from the persisted
rows, never from a provisional state.
"""

from typing import Any

from learny.content.application.ports import ContentDeps
from learny.content.domain import limits
from learny.content.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.time import to_iso

ACTIVE_FORMATION_STATUSES = frozenset({"active", "paused", "completed"})
MODULE_STATUSES = ("locked", "open", "validated")


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value if isinstance(value, str) else to_iso(value)


def _module_status(value: str) -> str:
    if value in MODULE_STATUSES:
        return value
    raise AppError("INTERNAL_ERROR", texts.UNKNOWN_MODULE_STATUS)


def _chapter_status(value: str) -> str:
    return "done" if value == "done" else "in_progress"


def _resource(row: dict[str, Any]) -> dict[str, Any]:
    metadata = row.get("metadata")
    pages = metadata.get("pages") if isinstance(metadata, dict) else None
    return {
        "id": row["id"],
        "kind": row["kind"],
        "title": row["title"],
        "status": row["status"],
        "errorCode": row.get("error_code"),
        "errorMessage": row.get("error_message"),
        "sizeBytes": row.get("size_bytes"),
        "pages": pages if isinstance(pages, int) else None,
        "url": row.get("url"),
        "createdAt": _iso(row.get("created_at")) or "",
        "updatedAt": _iso(row.get("updated_at")) or "",
    }


def _suggestion(row: dict[str, Any]) -> dict[str, Any]:
    metadata = row.get("metadata")
    reason = metadata.get("suggestionReason") if isinstance(metadata, dict) else None
    return {
        "id": row["id"],
        "title": row["title"],
        "url": row.get("url") or "",
        "reason": reason if isinstance(reason, str) else texts.SUGGESTION_REASON_CHAPTER,
        "createdAt": _iso(row.get("created_at")) or "",
    }


async def get_module_screen(
    deps: ContentDeps, actor: Actor, module_id: str, selected_chapter_id: str | None
) -> dict[str, Any]:
    """SCR-06: the module, its chapters, the selected chapter's contributions and suggestions."""
    async with deps.db.user_tx(actor) as tx:
        module = await queries.one(tx, queries.SELECT_MODULE, {"id": module_id, "user_id": actor.user_id})
        if module is None:
            raise AppError("NOT_FOUND", texts.MODULE_NOT_FOUND)
        if module["formation_status"] not in ACTIVE_FORMATION_STATUSES:
            raise AppError("CONFLICT", texts.PROGRAMME_NOT_ACTIVE)
        chapter_rows = await queries.rows(
            tx, queries.SELECT_MODULE_CHAPTERS, {"user_id": actor.user_id, "module_id": module_id}
        )
        if not chapter_rows:
            raise AppError("CONFLICT", texts.MODULE_WITHOUT_CHAPTER)
        chapters = [
            {
                "id": row["id"],
                "position": int(row["position"]),
                "title": row["title"],
                "contributionsStatus": _chapter_status(str(row["contributions_status"])),
                "doneAt": _iso(row.get("done_at")),
                "resourceCount": int(row["resource_count"]),
            }
            for row in chapter_rows
        ]
        selected = next((chapter for chapter in chapters if chapter["id"] == selected_chapter_id), None)
        if selected is None:
            selected = next(
                (chapter for chapter in chapters if chapter["contributionsStatus"] == "in_progress"),
                chapters[0],
            )
        resources = await queries.rows(
            tx,
            queries.SELECT_CHAPTER_RESOURCES,
            {"user_id": actor.user_id, "chapter_id": selected["id"]},
        )
        suggestions = await queries.rows(
            tx,
            queries.SELECT_CHAPTER_SUGGESTIONS,
            {"user_id": actor.user_id, "chapter_id": selected["id"]},
        )
        used = await queries.one(tx, queries.STORAGE_USED, {"user_id": actor.user_id})
    done = sum(1 for chapter in chapters if chapter["contributionsStatus"] == "done")
    return {
        "formation": {"id": module["formation_id"], "title": module["formation_title"]},
        "module": {
            "id": module["id"],
            "position": int(module["position"]),
            "positionTotal": int(module["position_total"]),
            "title": module["title"],
            "plannedStart": module["planned_start"],
            "plannedEnd": module["planned_end"],
            "threshold": int(module["threshold"]),
            "status": _module_status(str(module["status"])),
        },
        "chapters": chapters,
        "selectedChapterId": selected["id"],
        "resources": [_resource(row) for row in resources],
        "suggestions": [_suggestion(row) for row in suggestions],
        "counts": {
            "chaptersDone": done,
            "chaptersTotal": len(chapters),
            "chapterResources": len(resources),
            "chapterResourceLimit": limits.PER_CHAPTER,
            "storageUsedBytes": int(float(used["used"])) if used else 0,
            "storageQuotaBytes": limits.USER_QUOTA_BYTES,
        },
        "allChaptersDone": done == len(chapters),
    }
