"""Chapter summary: stored by the learner, corrected by the tutor (SPEC-609 EF-3, ET-2 to ET-5).

The learner's text is committed before the model call, so a model failure never loses it (CL-4); a
replay with the same request key returns the first summary and emits no second event (ET-2). The
summary references the course version that was read (BR-COU-10) and never rewrites a past attempt.
"""

import json
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from learny.content.application.ports import ContentDeps
from learny.content.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.platform.llm import LlmGateway, StepInput, SystemPart
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts
from learny.shared.time import to_iso

COURSE_SUMMARY_PROMPT_ID = "course.summary"
COURSE_SUMMARY_PROMPT_VERSION = 1
MAX_SUMMARY_CHARACTERS = 2_000
REQUEST_KEY = re.compile(r"^[A-Za-z0-9_-]{8,128}$")
SUMMARY_SYSTEM_PROMPT = texts.SUMMARY_SYSTEM_PROMPT


class CourseSummaryFeedback(BaseModel):
    """The strict shape of the tutor answer (verdict, message, missing key points)."""

    model_config = ConfigDict(extra="forbid")

    verdict: Literal["good", "partial", "insufficient"]
    message: str = Field(min_length=1, max_length=1_000)
    missing: list[str] = Field(default_factory=list, max_length=10)


def _iso(value: Any) -> str:
    return value if isinstance(value, str) else to_iso(value)


def _as_feedback(value: Any) -> CourseSummaryFeedback | None:
    """A stored or generated feedback, or `None` when it does not respect the contract."""
    if value is None:
        return None
    try:
        return CourseSummaryFeedback.model_validate(value)
    except ValueError:
        return None


def _view(row: dict[str, Any]) -> dict[str, Any]:
    feedback = _as_feedback(row.get("feedback"))
    return {
        "id": str(row["id"]),
        "chapterId": str(row["chapter_id"]),
        "courseId": str(row["course_id"]),
        "text": str(row["text"]),
        "feedback": None if feedback is None else feedback.model_dump(),
        "status": "deferred" if feedback is None else "corrected",
        "createdAt": _iso(row["created_at"]),
    }


def _key_points_of(data: Any) -> list[str]:
    if not isinstance(data, dict):
        return []
    points = data.get("points")
    if not isinstance(points, list):
        return []
    return [point for point in points if isinstance(point, str)][:7]


def _instruction(text: str, chapter_title: str, key_points: list[str]) -> str:
    points = (
        texts.SUMMARY_NO_KEY_POINTS
        if not key_points
        else "\n".join(f"{index + 1}. {point}" for index, point in enumerate(key_points))
    )
    return "\n".join(
        [
            texts.SUMMARY_TITLE_LINE.format(chapter_title=chapter_title),
            "",
            texts.SUMMARY_KEY_POINTS_HEADER,
            points,
            "",
            texts.SUMMARY_LEARNER_HEADER,
            text,
            "",
            texts.SUMMARY_FORMAT_JSON,
            texts.SUMMARY_FORMAT_VERDICT,
            texts.SUMMARY_FORMAT_INSUFFICIENT,
            texts.SUMMARY_FORMAT_MISSING,
        ]
    )


async def correct_chapter_summary(
    deps: ContentDeps,
    *,
    text: str,
    chapter_title: str,
    key_points: list[str],
) -> CourseSummaryFeedback:
    """BR-COU-07: the tutor corrects the summary and names what is missing.

    The prompt treats the learner's text and the key points as untrusted data, never as
    instructions. Any provider failure is an `AppError` the caller turns into a deferred draft.
    """
    gateway: LlmGateway = deps.llm
    step = StepInput(
        system=(SystemPart(text=SUMMARY_SYSTEM_PROMPT, cache=True),),
        messages=({"role": "user", "content": _instruction(text, chapter_title, key_points)},),
    )
    generated = await gateway.object("light", COURSE_SUMMARY_PROMPT_ID, CourseSummaryFeedback, step)
    if not isinstance(generated, CourseSummaryFeedback):
        raise AppError("AI_TASK_FAILED", texts.SUMMARY_FEEDBACK_INVALID)
    return generated


def _validate(chapter_id: str, body: dict[str, Any], request_key: str | None) -> tuple[str, str]:
    if not queries.is_uuid(chapter_id):
        raise AppError("VALIDATION_FAILED", texts.SUMMARY_CHAPTER_INVALID)
    course_id = str(body.get("courseId") or "")
    text = body.get("text")
    trimmed = text.strip() if isinstance(text, str) else ""
    if not queries.is_uuid(course_id) or trimmed == "" or len(trimmed) > MAX_SUMMARY_CHARACTERS:
        raise AppError("VALIDATION_FAILED", texts.SUMMARY_INVALID)
    if request_key is not None and REQUEST_KEY.match(request_key) is None:
        raise AppError("VALIDATION_FAILED", texts.INVALID_REQUEST_KEY)
    return course_id, trimmed


async def submit_chapter_summary(
    deps: ContentDeps,
    actor: Actor,
    chapter_id: str,
    body: dict[str, Any],
    request_key: str | None = None,
) -> dict[str, Any]:
    """EF-3: commits the text, corrects it, stores the feedback and emits one event."""
    course_id, text = _validate(chapter_id, body, request_key)
    committed = await _commit(deps, actor, chapter_id, course_id, text, request_key)
    if not committed["created"]:
        return _view(committed["row"])

    key_points = await _key_points(deps, actor, course_id, chapter_id)
    feedback: CourseSummaryFeedback | None = None
    try:
        feedback = await correct_chapter_summary(
            deps,
            text=str(committed["row"]["text"]),
            chapter_title=str(committed["chapter_title"]),
            key_points=key_points,
        )
    except AppError as error:
        _warn(deps, error.code)

    return await _apply_feedback(deps, actor, committed, feedback)


async def _commit(
    deps: ContentDeps,
    actor: Actor,
    chapter_id: str,
    course_id: str,
    text: str,
    request_key: str | None,
) -> dict[str, Any]:
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_chapter_summary(tx, actor.user_id, chapter_id)
        if request_key is not None:
            replay = await queries.find_chapter_summary(tx, actor.user_id, request_key)
            if replay is not None:
                return {
                    "row": replay,
                    "created": False,
                    "formation_id": None,
                    "course_id": replay["course_id"],
                    "chapter_title": "",
                }
        course = await queries.select_summary_course(tx, actor.user_id, course_id)
        if course is None:
            raise AppError("NOT_FOUND", texts.COURSE_NOT_FOUND)
        chapter = await queries.select_summary_chapter(tx, chapter_id, str(course["module_id"]), course_id)
        if chapter is None:
            raise AppError("NOT_FOUND", texts.CHAPTER_NOT_FOUND)
        row = await queries.insert_chapter_summary(
            tx,
            user_id=actor.user_id,
            chapter_id=chapter_id,
            course_id=course_id,
            text=text,
            request_key=request_key,
            created_at=to_iso(deps.clock.now()),
        )
        if row is None:
            raise AppError("INTERNAL_ERROR", texts.SUMMARY_NOT_STORED)
        return {
            "row": row,
            "created": True,
            "formation_id": str(course["formation_id"]),
            "course_id": course_id,
            "chapter_title": str(chapter["title"]),
        }


async def _key_points(deps: ContentDeps, actor: Actor, course_id: str, chapter_id: str) -> list[str]:
    async with deps.db.user_tx(actor) as tx:
        data = await queries.select_summary_key_points(tx, course_id, chapter_id)
    return _key_points_of(data)


async def _apply_feedback(
    deps: ContentDeps,
    actor: Actor,
    committed: dict[str, Any],
    feedback: CourseSummaryFeedback | None,
) -> dict[str, Any]:
    row = committed["row"]
    async with deps.db.user_tx(actor) as tx:
        if feedback is not None:
            await queries.update_chapter_summary_feedback(
                tx,
                row_id=str(row["id"]),
                user_id=actor.user_id,
                feedback=json.dumps(feedback.model_dump(), ensure_ascii=False),
            )
        await tx.emit(
            "course/summary-submitted",
            {
                "userId": actor.user_id,
                "courseId": str(committed["course_id"]),
                "chapterId": str(row["chapter_id"]),
                "summaryId": str(row["id"]),
                "corrected": feedback is not None,
            },
            event_id=f"course-summary:{row['id']}",
        )
    stored = dict(row)
    stored["feedback"] = None if feedback is None else feedback.model_dump()
    return _view(stored)


def _warn(deps: ContentDeps, code: str) -> None:
    """CL-4: a tutor failure only defers the correction; the text is already stored."""
    try:
        deps.logger.warning("summary correction deferred", code=code)
    except Exception:  # logging must never change the business outcome
        return


__all__ = [
    "COURSE_SUMMARY_PROMPT_ID",
    "COURSE_SUMMARY_PROMPT_VERSION",
    "CourseSummaryFeedback",
    "correct_chapter_summary",
    "submit_chapter_summary",
]
