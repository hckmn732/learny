"""Monotone reading progress of a course (SPEC-609 EF-3, ET-5, BR-COU-08).

Port of `packages/services/src/courses/progress.ts`: the client sends the sections it has seen, the
server derives the percentage from the sections that actually belong to the chapter. A smaller
value never replaces a larger one and the course percentage is the mean of its chapters. Every
transition is one transactional write with one deterministic event, so a replay is a no-op.
"""

import math
import re
import uuid
from typing import Any

from learny.content.application.ports import ContentDeps
from learny.content.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.time import to_iso

UUID_PATTERN = re.compile(
    r"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
    r"|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
)
WORDS = re.compile(r"\s+")


def reading_percent(visible: int, total: int) -> int:
    """BR-COU-08: floor of the seen share, bounded to 0..100."""
    if total <= 0:
        return 0
    bounded = min(max(visible, 0), total)
    return min(100, max(0, (bounded * 100) // total))


def merge_progress(current: int, measured: int) -> int:
    """A smaller value never replaces a larger one."""
    return max(0, min(100, max(current, measured)))


def course_percent(chapters: list[int]) -> int:
    """BR-COU-08: mean of the chapters that have content, rounded half up like `Math.round`."""
    if not chapters:
        return 0
    total = sum(max(0, min(100, percent)) for percent in chapters)
    return min(100, max(0, math.floor(total / len(chapters) + 0.5)))


def estimate_reading_minutes(words: int) -> int:
    """BR-COU-11: 200 words per minute, rounded up, at least one minute."""
    if words <= 0:
        return 1
    return max(1, math.ceil(words / 200))


def count_words(text: str) -> int:
    """Words of a section text, as `text.trim().split(/\\s+/u).length` counts them."""
    trimmed = text.strip()
    return 0 if trimmed == "" else len(WORDS.split(trimmed))


def assert_uuid(value: str, field: str) -> None:
    """Refuses a malformed identifier before any query."""
    if UUID_PATTERN.fullmatch(value) is None:
        raise AppError("VALIDATION_FAILED", texts.INVALID_IDENTIFIER.format(field=field))


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    return value if isinstance(value, str) else to_iso(value)


async def record_course_progress(
    deps: ContentDeps, actor: Actor, course_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    """SPEC-609 EF-3: records the sections the learner has seen and answers the percentages."""
    assert_uuid(course_id, "courseId")
    chapter_id = str(body["chapterId"])
    assert_uuid(chapter_id, "chapterId")
    visible_ids = [str(value) for value in body.get("visibleSectionIds") or []]
    for section_id in visible_ids:
        assert_uuid(section_id, "visibleSectionIds")

    async with deps.db.user_tx(actor) as tx:
        await queries.execute(
            tx,
            queries.LOCK_COURSE_PROGRESS,
            {"key": f"course-progress:{actor.user_id}:{course_id}"},
        )
        course = await queries.one(
            tx, queries.SELECT_PROGRESS_COURSE, {"id": course_id, "user_id": actor.user_id}
        )
        if course is None:
            raise AppError("NOT_FOUND", texts.COURSE_NOT_FOUND)
        chapters = await queries.rows(
            tx,
            queries.SELECT_PROGRESS_CHAPTERS,
            {
                "user_id": actor.user_id,
                "course_id": str(course["id"]),
                "module_id": str(course["module_id"]),
            },
        )
        selected = next((row for row in chapters if row["id"] == chapter_id), None)
        if selected is None:
            raise AppError("NOT_FOUND", texts.CHAPTER_NOT_FOUND)
        sections = await queries.rows(
            tx,
            queries.SELECT_CHAPTER_SECTIONS,
            {"course_id": str(course["id"]), "chapter_id": chapter_id},
        )
        known = {str(row["id"]) for row in sections}
        visible = {value for value in visible_ids if value in known}
        measured = reading_percent(len(visible), len(known))
        current = int(selected.get("percent") or 0)
        nxt = merge_progress(current, measured)
        now = deps.clock.now()
        if nxt > current:
            await queries.execute(
                tx,
                queries.UPSERT_READING_PROGRESS,
                {
                    "user_id": actor.user_id,
                    "course_id": str(course["id"]),
                    "chapter_id": chapter_id,
                    "percent": nxt,
                    "now": to_iso(now),
                },
            )
            await tx.emit(
                "course/progress-updated",
                {
                    "userId": actor.user_id,
                    "courseId": str(course["id"]),
                    "chapterId": chapter_id,
                    "percent": nxt,
                },
                event_id=f"course-progress:{course['id']}:{chapter_id}:{nxt}",
            )
        measured_chapters = [
            nxt if row["id"] == chapter_id else int(row.get("percent") or 0)
            for row in chapters
            if int(row["total"]) > 0
        ]
        if nxt > current:
            stored_at: str | None = to_iso(now)
        else:
            stored_at = _iso(selected.get("updated_at"))
        return {
            "chapterPercent": nxt,
            "coursePercent": course_percent(measured_chapters),
            "updatedAt": stored_at,
        }


async def read_progress_by_chapter(tx: Tx, user_id: str, course_id: str) -> dict[str, int]:
    """The persisted percentages of one course, indexed by chapter."""
    found = await queries.rows(
        tx, queries.SELECT_PROGRESS_BY_CHAPTER, {"user_id": user_id, "course_id": course_id}
    )
    return {str(row["chapter_id"]): int(row["percent"]) for row in found}


def is_uuid(value: str) -> bool:
    """True for a canonical identifier, used by the routes that validate a path parameter."""
    return UUID_PATTERN.fullmatch(value) is not None


_ = uuid
