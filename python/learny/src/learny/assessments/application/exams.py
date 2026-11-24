"""Exam answers and marks of a mock exam (SPEC-614 EF-2, ET-4, BR-PRA-03).

An answer is written before the deadline plus the five-second tolerance; a marked question keeps its
marker across reloads.
"""

import json
from collections.abc import Mapping
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.application.quiz import as_object, clamp_time, items_of
from learny.assessments.domain.bricks.grade import grade_brick
from learny.assessments.domain.bricks.grade_support import BrickGradeError
from learny.assessments.domain.bricks.schema import parse_payload
from learny.assessments.domain.bricks.types import AUTO_GRADED_TYPES
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import parse_iso, to_epoch_ms, to_iso

EXAM_GRACE_SECONDS = 5
"""ADR-0172 section 2 - the tolerance window after the deadline."""


def exam_accepts_answer(deadline_at: Any, now: Any) -> bool:
    """True while an answer may still be written (deadline plus the tolerance window)."""
    if deadline_at is None:
        return False
    deadline = parse_iso(deadline_at) if isinstance(deadline_at, str) else deadline_at
    return to_epoch_ms(now) <= to_epoch_ms(deadline) + EXAM_GRACE_SECONDS * 1000


def marked_positions_of(value: Any) -> list[int]:
    """`markedPositionsOf`: the marked positions stored in `review_feedback`."""
    review = as_object(value)
    if review is None:
        return []
    positions = review.get("markedPositions")
    if not isinstance(positions, list):
        return []
    return [entry for entry in positions if isinstance(entry, int) and not isinstance(entry, bool)]


def item_for_position(attempt: Mapping[str, Any], position: int) -> dict[str, Any]:
    """`readItemForPosition`: the item of the exam, refused when the position does not exist."""
    items = items_of(attempt["items"])
    if position < 1 or position > len(items):
        raise AppError("VALIDATION_FAILED", texts.EXAM_POSITION_UNKNOWN)
    return items[position - 1]


def validate_response(item: Mapping[str, Any], response: Any) -> None:
    """ET-1 - a response that does not match its brick schema creates nothing (CL-1)."""
    type_name = str(item.get("type"))
    if type_name not in AUTO_GRADED_TYPES:
        return
    parsed, issues = parse_payload(type_name, item.get("payload"))
    if parsed is None or issues:
        raise AppError("VALIDATION_FAILED", texts.EXAM_QUESTION_UNREADABLE)
    raw_version = item.get("brickVersionId")
    version_id = raw_version if isinstance(raw_version, str) else ""
    try:
        grade_brick(type_name, parsed, response, version_id)
    except BrickGradeError as error:
        if error.code == "RESPONSE_INVALID":
            raise AppError(
                "VALIDATION_FAILED",
                texts.EXAM_RESPONSE_MISMATCH,
                errors=[{"path": issue["path"], "message": issue["message"]} for issue in error.issues],
            ) from error


async def _locked_attempt(tx: Any, user_id: str, attempt_id: str) -> Mapping[str, Any]:
    """The exam attempt, locked, refused when it is no longer running (409)."""
    attempt = await queries.read_exam_attempt(tx, user_id, attempt_id, lock=True)
    if attempt is None:
        raise AppError("NOT_FOUND", texts.EXAM_ATTEMPT_NOT_FOUND)
    if attempt["status"] != "in_progress":
        raise AppError("CONFLICT", texts.EXAM_ATTEMPT_CLOSED, status=409)
    return attempt


async def save_exam_answer(
    deps: AssessmentDeps, actor: Actor, attempt_id: str, position: int, body: Mapping[str, Any]
) -> dict[str, Any]:
    """EF-2 - writes one answer before the deadline; a late answer is refused."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        attempt = await _locked_attempt(tx, actor.user_id, attempt_id)
        if not exam_accepts_answer(attempt["deadline_at"], now):
            raise AppError("EXAM_TIME_OVER", texts.EXAM_TIME_OVER)
        item = item_for_position(attempt, position)
        validate_response(item, body.get("response"))
        await queries.update_exam_answer(
            tx,
            attempt_id=attempt_id,
            position=position,
            response=json.dumps(body.get("response"), ensure_ascii=False),
            time_ms=clamp_time(body.get("timeMs")),
            now=to_iso(now),
        )
        return {"position": position, "savedAt": to_iso(now)}


async def mark_exam_question(
    deps: AssessmentDeps, actor: Actor, attempt_id: str, position: int, marked: bool
) -> dict[str, Any]:
    """BR-PRA-03 - marks a question for review; the marker survives a reload."""
    async with deps.db.user_tx(actor) as tx:
        attempt = await _locked_attempt(tx, actor.user_id, attempt_id)
        item_for_position(attempt, position)
        current = set(marked_positions_of(attempt["review_feedback"]))
        if marked:
            current.add(position)
        else:
            current.discard(position)
        positions = sorted(current)
        await queries.update_exam_marked_positions(tx, attempt_id, json.dumps(positions, ensure_ascii=False))
        return {"position": position, "marked": marked}


__all__ = [
    "EXAM_GRACE_SECONDS",
    "exam_accepts_answer",
    "item_for_position",
    "mark_exam_question",
    "marked_positions_of",
    "save_exam_answer",
    "validate_response",
]
