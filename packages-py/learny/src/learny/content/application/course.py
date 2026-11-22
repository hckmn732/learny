"""Read model of the course screen (SCR-07, SPEC-608 EF-1 to EF-5, BR-COU-03/10/11).

Port of `packages/services/src/courses/get-course.ts`: everything runs under the caller's RLS
transaction with an explicit owner filter, so a foreign module is a plain 404. The page receives the
current ready version of the module, the selected chapter, its typed sections with their verified
citations and, for a base course, the pending resource suggestions.
"""

import json
from collections.abc import Sequence
from typing import Any

from learny.content.application.ports import ContentDeps
from learny.content.application.progress import (
    count_words,
    course_percent,
    estimate_reading_minutes,
    read_progress_by_chapter,
)
from learny.content.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.time import to_iso
from learny.tutor.public import starters_of


def _iso(value: Any) -> str:
    return value if isinstance(value, str) else to_iso(value)


def as_object(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except ValueError:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def as_string_array(value: Any) -> list[str]:
    if isinstance(value, list):
        return [entry for entry in value if isinstance(entry, str)]
    if isinstance(value, str):
        body = value.strip("{}")
        return [entry.strip().strip('"') for entry in body.split(",") if entry.strip().strip('"')]
    return []


def section_text(section: dict[str, Any]) -> str:
    parts = [str(section.get("content_md") or ""), str(section.get("title") or "")]
    data = as_object(section.get("data"))
    if data is not None:
        if isinstance(data.get("question"), str):
            parts.append(data["question"])
            if isinstance(data.get("answer"), str):
                parts.append(data["answer"])
        points = data.get("points")
        if isinstance(points, list):
            parts.append(" ".join(point for point in points if isinstance(point, str)))
        if isinstance(data.get("mnemonic"), str):
            parts.append(data["mnemonic"])
        for side in ("left", "right"):
            value = as_object(data.get(side))
            if value is None:
                continue
            for key in ("title", "body", "example"):
                if isinstance(value.get(key), str):
                    parts.append(value[key])
    return " ".join(parts)


def reading_minutes_of(sections: Sequence[dict[str, Any]]) -> int:
    text = " ".join(section_text(section) for section in sections)
    return estimate_reading_minutes(count_words(text))


def _citation(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "chunkId": row.get("chunk_id"),
        "resourceId": row.get("resource_id"),
        "label": row.get("label"),
        "quote": row.get("quote"),
        "location": as_object(row.get("location")),
        "mediaKind": row.get("media_kind"),
        "deleted": bool(row.get("deleted")),
    }


def _section(row: dict[str, Any], citations: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "kind": row["kind"],
        "anchor": row["anchor"],
        "title": row.get("title"),
        "contentMd": row.get("content_md"),
        "data": as_object(row.get("data")),
        "origin": "resource" if row.get("origin") == "resource" else "tutor",
        "notionIds": as_string_array(row.get("notion_ids")),
        "citations": citations,
        "version": int(row["version"]),
        "reported": bool(row.get("reported")),
    }


def _summary(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    feedback = as_object(row.get("feedback"))
    return {
        "id": row["id"],
        "chapterId": row["chapter_id"],
        "courseId": row["course_id"],
        "text": row["text"],
        "feedback": feedback,
        "status": "deferred" if feedback is None else "corrected",
        "createdAt": _iso(row["created_at"]),
    }


async def get_module_course(
    deps: ContentDeps, actor: Actor, module_id: str, chapter_id: str | None
) -> dict[str, Any]:
    """SCR-07: the published course of one module and the selected chapter."""
    async with deps.db.user_tx(actor) as tx:
        module = await queries.one(tx, queries.SELECT_COURSE_MODULE, {"id": module_id})
        if module is None:
            raise AppError("NOT_FOUND", texts.MODULE_NOT_FOUND)
        chapter_rows = await queries.rows(tx, queries.SELECT_COURSE_CHAPTERS, {"module_id": module_id})
        if not chapter_rows:
            raise AppError("NOT_FOUND", texts.CHAPTER_NOT_IN_MODULE)
        selected = next((row for row in chapter_rows if row["id"] == chapter_id), chapter_rows[0])
        current = await queries.one(
            tx,
            queries.SELECT_CURRENT_COURSE,
            {"user_id": actor.user_id, "module_id": module_id},
        )
        latest = await queries.one(
            tx, queries.SELECT_LATEST_COURSE, {"user_id": actor.user_id, "module_id": module_id}
        )
        if current is not None and current["status"] == "ready":
            generation_status = "ready"
        elif latest is not None and latest["status"] == "generating":
            generation_status = "generating"
        elif latest is not None and latest["status"] == "failed":
            generation_status = "failed"
        else:
            generation_status = "none"
        generation = {
            "status": generation_status,
            "version": int(latest["version"]) if latest is not None else None,
            "error": latest.get("error") if latest is not None and latest["status"] == "failed" else None,
        }
        counts = (
            {}
            if current is None
            else {
                str(row["chapter_id"]): int(row["total"])
                for row in await queries.rows(
                    tx, queries.COUNT_SECTIONS_BY_CHAPTER, {"course_id": str(current["id"])}
                )
            }
        )
        persisted = (
            {} if current is None else await read_progress_by_chapter(tx, actor.user_id, str(current["id"]))
        )
        chapters = [
            {
                "id": row["id"],
                "position": int(row["position"]),
                "title": row["title"],
                "hasCourse": counts.get(str(row["id"]), 0) > 0,
                "percent": persisted.get(str(row["id"]), 0),
            }
            for row in chapter_rows
        ]
        screen: dict[str, Any] = {
            "formation": {"id": module["formation_id"], "title": module["formation_title"]},
            "module": {
                "id": module["module_id"],
                "position": int(module["module_position"]),
                "positionTotal": int(module["modules_total"]),
                "title": module["module_title"],
            },
            "chapters": chapters,
            "selectedChapterId": selected["id"],
            "course": None,
            "generation": generation,
        }
        if current is None or current["status"] != "ready":
            return screen

        section_rows = await queries.rows(
            tx,
            queries.SELECT_COURSE_SECTIONS,
            {"course_id": str(current["id"]), "chapter_id": str(selected["id"])},
        )
        by_section: dict[str, list[dict[str, Any]]] = {}
        if section_rows:
            for row in await queries.rows(
                tx,
                queries.SELECT_SECTION_CITATIONS,
                {"section_ids": [str(section["id"]) for section in section_rows]},
            ):
                by_section.setdefault(str(row["section_id"]), []).append(_citation(row))
        sections = [_section(row, by_section.get(str(row["id"]), [])) for row in section_rows]
        ready = await queries.one(
            tx,
            queries.COUNT_READY_RESOURCES,
            {"user_id": actor.user_id, "chapter_id": str(selected["id"])},
        )
        resource_count = int(ready["total"]) if ready else 0
        suggestions = (
            []
            if resource_count > 0
            else await queries.rows(
                tx,
                queries.SELECT_COURSE_SUGGESTIONS,
                {"user_id": actor.user_id, "chapter_id": str(selected["id"])},
            )
        )
        summary = await queries.one(
            tx,
            queries.SELECT_CHAPTER_SUMMARY,
            {
                "user_id": actor.user_id,
                "chapter_id": str(selected["id"]),
                "course_id": str(current["id"]),
            },
        )
        notion_rows = await queries.rows(
            tx, queries.SELECT_CHAPTER_NOTIONS, {"user_id": actor.user_id, "chapter_id": str(selected["id"])}
        )
        gaps = [row for row in notion_rows if row.get("gap_nature") is not None]
        gaps.sort(key=lambda row: float(row.get("mastery") or 101))
        gap_notion = gaps[0] if gaps else None
        starters = starters_of(
            [
                {
                    "kind": row["kind"],
                    "contentMd": row.get("content_md"),
                    "data": as_object(row.get("data")),
                    "notionIds": as_string_array(row.get("notion_ids")),
                }
                for row in section_rows
            ],
            [
                {
                    "id": row["id"],
                    "label": row["label"],
                    "mastery": float(row["mastery"]) if row.get("mastery") is not None else 101,
                }
                for row in notion_rows
            ],
            str(gap_notion["id"]) if gap_notion is not None else None,
        )
        index = next(position for position, row in enumerate(chapter_rows) if row["id"] == selected["id"])
        chapter_percent = persisted.get(str(selected["id"]), 0)
        screen["course"] = {
            "id": current["id"],
            "version": int(current["version"]),
            "status": "ready",
            "generatedAt": _iso(current["created_at"]),
            "model": current.get("model"),
            "readingMinutes": reading_minutes_of(section_rows),
            "resourceCount": resource_count,
            "baseCourse": resource_count == 0,
            "chapter": {
                "id": selected["id"],
                "position": int(selected["position"]),
                "title": selected["title"],
                "hasCourse": len(sections) > 0,
                "percent": chapter_percent,
            },
            "previousChapterId": chapter_rows[index - 1]["id"] if index > 0 else None,
            "nextChapterId": (chapter_rows[index + 1]["id"] if index + 1 < len(chapter_rows) else None),
            "sections": sections,
            "suggestions": [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "url": row["url"],
                    "reason": row.get("reason") or texts.SUGGESTION_REASON_COURSE,
                }
                for row in suggestions
            ],
            "tutorStarters": starters,
            "tutorGap": gap_notion["label"] if gap_notion is not None else None,
            "progress": {
                "chapterPercent": chapter_percent,
                "coursePercent": course_percent(
                    [chapter["percent"] for chapter in chapters if chapter["hasCourse"]]
                ),
                "updatedAt": None,
            },
            "summary": _summary(summary),
            "quiz": {
                "threshold": int(module["threshold"]),
                "href": (f"/formations/{module['formation_id']}/modules/{module['module_id']}"),
            },
        }
        return screen
