"""Import or dismiss a tutor suggestion (BR-APP-05, SPEC-607 EF-4, ET-5).

Port of `packages/services/src/resources/suggestions.ts`: importing creates one learner `web`
contribution and its event in the same transaction; dismissing creates nothing and emits nothing.
The suggestion URL is never fetched here: the ingestion applies its anti-SSRF rules later (SPEC-510).
"""

from typing import Any

from learny.content.application.ports import ContentDeps
from learny.content.application.resources import uploaded_event_id, uploaded_payload
from learny.content.domain import limits
from learny.content.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.time import to_iso


def _decision(row: dict[str, Any], resource_id: str | None) -> dict[str, Any]:
    status = "dismissed" if row.get("suggestion_status") == "dismissed" else "imported"
    return {"id": row["id"], "status": status, "resourceId": resource_id}


async def import_suggestion(deps: ContentDeps, actor: Actor, suggestion_id: str) -> dict[str, Any]:
    """BR-APP-05: one learner web resource, one event, the suggestion marked imported."""
    async with deps.db.user_tx(actor) as tx:
        suggestion = await queries.lock_suggestion(tx, actor.user_id, suggestion_id)
        if suggestion is None:
            raise AppError("NOT_FOUND", texts.SUGGESTION_NOT_FOUND)
        if suggestion.get("suggestion_status") == "dismissed":
            raise AppError("CONFLICT", texts.SUGGESTION_DISMISSED)
        if suggestion.get("suggestion_status") == "imported":
            return _decision(suggestion, None)
        chapter_id = suggestion.get("chapter_id")
        url = suggestion.get("url")
        if chapter_id is None or url is None:
            raise AppError("CONFLICT", texts.SUGGESTION_WITHOUT_TARGET)
        if suggestion.get("module_status") == "locked":
            raise AppError("FORBIDDEN", texts.MODULE_LOCKED)
        await queries.lock_owner(tx, actor.user_id)
        limits.assert_capacity(
            limits.Capacity(
                chapter_count=await queries.chapter_resource_count(tx, actor.user_id, str(chapter_id)),
                used_bytes=0,
                added_bytes=0,
            )
        )
        existing = await queries.select_imported_resource(tx, actor.user_id, str(chapter_id), str(url))
        resource_id = existing["id"] if existing is not None else None
        if resource_id is None:
            created = await queries.one(
                tx,
                queries.INSERT_TEXT_RESOURCE,
                {
                    "user_id": actor.user_id,
                    "formation_id": str(suggestion["formation_id"]),
                    "chapter_id": str(chapter_id),
                    "kind": "web",
                    "title": str(suggestion["title"]),
                    "text": None,
                    "url": str(url),
                },
            )
            if created is None:
                raise AppError("INTERNAL_ERROR", texts.SUGGESTION_NOT_IMPORTED)
            resource_id = str(created["id"])
            await tx.emit(
                "resource/uploaded",
                uploaded_payload(
                    actor.user_id,
                    resource_id,
                    str(suggestion["formation_id"]),
                    str(chapter_id),
                    "web",
                ),
                event_id=uploaded_event_id(resource_id),
            )
        await queries.mark_suggestion_status(
            tx, actor.user_id, str(suggestion["id"]), "imported", to_iso(deps.clock.now())
        )
        return {"id": suggestion["id"], "status": "imported", "resourceId": resource_id}


async def dismiss_suggestion(deps: ContentDeps, actor: Actor, suggestion_id: str) -> dict[str, Any]:
    """BR-APP-05: the suggestion leaves the list, no contribution exists."""
    async with deps.db.user_tx(actor) as tx:
        suggestion = await queries.lock_suggestion(tx, actor.user_id, suggestion_id)
        if suggestion is None:
            raise AppError("NOT_FOUND", texts.SUGGESTION_NOT_FOUND)
        if suggestion.get("suggestion_status") == "imported":
            raise AppError("CONFLICT", texts.SUGGESTION_IMPORTED)
        if suggestion.get("suggestion_status") != "dismissed":
            await queries.mark_suggestion_status(
                tx, actor.user_id, str(suggestion["id"]), "dismissed", to_iso(deps.clock.now())
            )
        return {"id": suggestion["id"], "status": "dismissed", "resourceId": None}
