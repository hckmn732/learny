"""Report and correct a generated course section (SPEC-609 EF-4, ET-2, ET-4, BR-COU-09).

Port of `packages/services/src/courses/{edit,report}-section.ts`: a learner correction archives the
previous state through the `archive_course_section_revision` trigger, increments the section version
and reactivates the bank bricks its report suspended. `expectedVersion` is the optimistic guard: a
stale reader receives 409 and the current version, never a silent overwrite. A report keeps the
section readable, suspends the bank bricks of its notions and is idempotent per request key.
"""

import re
import uuid
from typing import Any

from learny.content.application.ports import ContentDeps
from learny.content.application.progress import assert_uuid
from learny.content.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.locale_fr import validation
from learny.shared.locale_fr.details import INVALID_INPUT
from learny.shared.time import to_iso

REQUEST_KEY = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


def as_string_array(value: Any) -> list[str]:
    """A `uuid[]` column read as text, or a parsed array (psycopg hands back `UUID` objects)."""
    if isinstance(value, list):
        return [
            entry if isinstance(entry, str) else str(entry)
            for entry in value
            if isinstance(entry, (str, uuid.UUID))
        ]
    if isinstance(value, str):
        body = value.strip("{}")
        return [entry.strip().strip('"') for entry in body.split(",") if entry.strip().strip('"')]
    return []


def _iso(value: Any) -> str:
    return value if isinstance(value, str) else to_iso(value)


def _view(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "sectionId": row["id"],
        "version": int(row["version"]),
        "title": row.get("title"),
        "contentMd": row.get("content_md"),
        "reported": bool(row.get("reported")),
        "updatedAt": _iso(row["updated_at"]),
    }


def _check_request_key(request_key: str | None) -> str | None:
    if request_key is None:
        return None
    if REQUEST_KEY.fullmatch(request_key) is None:
        raise AppError("VALIDATION_FAILED", texts.INVALID_REQUEST_KEY)
    return request_key


def _edit_fields(body: dict[str, Any]) -> tuple[str | None, str | None]:
    """BR-COU-09: a correction always carries at least one editable field (contract refine)."""
    title = body.get("title")
    content_md = body.get("contentMd")
    if title is None and content_md is None:
        raise AppError(
            "VALIDATION_FAILED",
            INVALID_INPUT,
            errors=[{"path": "body.contentMd", "message": texts.EDIT_NO_FIELD}],
        )
    return title, content_md


def _report_reason(body: dict[str, Any]) -> str:
    """EF-4: the reason is trimmed like the contract and cannot be blank."""
    reason = str(body.get("reason") or "").strip()
    if reason == "":
        raise AppError(
            "VALIDATION_FAILED",
            INVALID_INPUT,
            errors=[{"path": "body.reason", "message": validation.too_small("string", 1, inclusive=True)}],
        )
    return reason


async def edit_course_section(
    deps: ContentDeps,
    actor: Actor,
    section_id: str,
    body: dict[str, Any],
    request_key: str | None,
) -> dict[str, Any]:
    """BR-COU-09: applies the learner correction of one section, guarded by its version."""
    assert_uuid(section_id, "sectionId")
    requested_title, requested_content = _edit_fields(body)
    key = _check_request_key(request_key)
    async with deps.db.user_tx(actor) as tx:
        await queries.execute(
            tx,
            queries.LOCK_COURSE_PROGRESS,
            {"key": f"course-section:{actor.user_id}:{section_id}"},
        )
        if key is not None:
            replay = await queries.one(
                tx, queries.SELECT_SECTION_EDIT_KEY, {"user_id": actor.user_id, "key": key}
            )
            if replay is not None:
                current = await queries.one(
                    tx, queries.SELECT_EDIT_SECTION, {"id": section_id, "user_id": actor.user_id}
                )
                if current is None:
                    raise AppError("NOT_FOUND", texts.SECTION_NOT_FOUND)
                return _view(current)
        current = await queries.one(
            tx, queries.SELECT_EDIT_SECTION, {"id": section_id, "user_id": actor.user_id}
        )
        if current is None:
            raise AppError("NOT_FOUND", texts.SECTION_NOT_FOUND)
        if int(current["version"]) != int(body["expectedVersion"]):
            raise AppError(
                "CONFLICT",
                texts.SECTION_CHANGED_SINCE_READ,
                errors=[
                    {
                        "path": "expectedVersion",
                        "message": texts.SECTION_VERSION_CURRENT.format(version=current["version"]),
                    }
                ],
            )
        title = current.get("title") if requested_title is None else requested_title
        content_md = current.get("content_md") if requested_content is None else requested_content
        changed = title != current.get("title") or content_md != current.get("content_md")
        if not changed and not current.get("reported"):
            return _view(current)
        await tx.set_local("learny.actor", "learner")
        now = to_iso(deps.clock.now())
        await queries.execute(
            tx,
            queries.UPDATE_SECTION_EDIT,
            {
                "id": section_id,
                "user_id": actor.user_id,
                "title": title,
                "content_md": content_md,
                "request_key": key,
                "now": now,
            },
        )
        updated = await queries.one(
            tx, queries.SELECT_EDIT_SECTION, {"id": section_id, "user_id": actor.user_id}
        )
        if updated is None:
            raise AppError("NOT_FOUND", texts.SECTION_NOT_FOUND)
        resolved = await queries.rows(
            tx, queries.RESOLVE_SECTION_REPORTS, {"id": section_id, "user_id": actor.user_id, "now": now}
        )
        affected: set[str] = set()
        for row in resolved:
            affected.update(as_string_array(row.get("affected_brick_ids")))
        await reactivate_bricks(tx, actor.user_id, sorted(affected))
        await tx.emit(
            "course/section-edited",
            {
                "userId": actor.user_id,
                "courseId": str(current["course_id"]),
                "sectionId": section_id,
                "version": int(updated["version"]),
            },
            event_id=f"course-section-edited:{section_id}:{int(updated['version'])}",
        )
        return _view(updated)


async def suspend_bricks_for_notions(
    tx: Tx, user_id: str, formation_id: str, notion_ids: list[str]
) -> list[str]:
    """Suspends the active bank/validation bricks that share a notion with the section."""
    if not notion_ids:
        return []
    found = await queries.rows(
        tx,
        queries.SELECT_BRICKS_FOR_NOTIONS,
        {"user_id": user_id, "formation_id": formation_id, "notion_ids": notion_ids},
    )
    ids = [str(row["id"]) for row in found]
    if not ids:
        return []
    await queries.execute(tx, queries.SUSPEND_BRICKS, {"user_id": user_id, "ids": ids})
    return ids


async def reactivate_bricks(tx: Tx, user_id: str, brick_ids: list[str]) -> None:
    """Restores only the bricks no open report still lists."""
    if not brick_ids:
        return
    await queries.execute(tx, queries.REACTIVATE_BRICKS, {"user_id": user_id, "ids": brick_ids})


async def report_course_section(
    deps: ContentDeps,
    actor: Actor,
    section_id: str,
    body: dict[str, Any],
    request_key: str | None,
) -> dict[str, Any]:
    """BR-COU-09, BR-MEM-09: reports a section once and suspends the bricks of its notions."""
    assert_uuid(section_id, "sectionId")
    reason = _report_reason(body)
    key = _check_request_key(request_key)
    async with deps.db.user_tx(actor) as tx:
        await queries.execute(
            tx,
            queries.LOCK_COURSE_PROGRESS,
            {"key": f"course-section-report:{actor.user_id}:{section_id}"},
        )
        if key is not None:
            replay = await queries.one(tx, queries.SELECT_REPORT_KEY, {"user_id": actor.user_id, "key": key})
            if replay is not None:
                return {
                    "reportId": replay["id"],
                    "sectionId": replay["section_id"],
                    "status": "open",
                    "reported": True,
                    "createdAt": _iso(replay["created_at"]),
                }
        open_report = await queries.one(
            tx, queries.SELECT_OPEN_SECTION_REPORT, {"id": section_id, "user_id": actor.user_id}
        )
        if open_report is not None:
            return {
                "reportId": open_report["id"],
                "sectionId": section_id,
                "status": "open",
                "reported": True,
                "createdAt": _iso(open_report["created_at"]),
            }
        section = await queries.one(
            tx, queries.SELECT_REPORT_SECTION, {"id": section_id, "user_id": actor.user_id}
        )
        if section is None:
            raise AppError("NOT_FOUND", texts.SECTION_NOT_FOUND)
        affected = await suspend_bricks_for_notions(
            tx,
            actor.user_id,
            str(section["formation_id"]),
            as_string_array(section.get("notion_ids")),
        )
        now = to_iso(deps.clock.now())
        await queries.execute(
            tx,
            queries.MARK_SECTION_REPORTED,
            {"id": section_id, "user_id": actor.user_id, "now": now},
        )
        report = await queries.one(
            tx,
            queries.INSERT_SECTION_REPORT,
            {
                "user_id": actor.user_id,
                "id": section_id,
                "reason": reason,
                "affected": affected,
                "request_key": key,
                "now": now,
            },
        )
        if report is None:
            raise AppError("INTERNAL_ERROR", texts.REPORT_NOT_STORED)
        await tx.emit(
            "course/section-reported",
            {
                "userId": actor.user_id,
                "courseId": str(section["course_id"]),
                "sectionId": section_id,
                "reportId": report["id"],
            },
            event_id=f"course-section-reported:{report['id']}",
        )
        return {
            "reportId": report["id"],
            "sectionId": section_id,
            "status": "open",
            "reported": True,
            "createdAt": _iso(report["created_at"]),
        }
