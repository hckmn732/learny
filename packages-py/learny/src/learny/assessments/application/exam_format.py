"""Introduction and format confirmation of a mock exam (SPEC-614 EF-1, EF-5, ET-3, BR-PRA-02).

The introduction shows the proposed or confirmed format, the studied and diagnostic modules with the
diagnostic share, the two planned exams and the last attempt. Confirming the format is the only
write: an extracted guide format is never applied before the learner accepts it (ET-3), and
confirming an already stored format is idempotent.
"""

import json
from collections.abc import Mapping
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.domain import exam_format as domain
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.learning.domain.time import add_days, local_date_of
from learny.shared import time as shared_time
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import from_epoch_ms, to_iso

MOCK_EXAM_START_TIME = "09:00"
"""ADR-0028 - the two mock exams start at nine in the learner zone."""

DEFAULT_FORMATION_DAYS = 30
"""`civilDateOffset(..., 30)` when the formation carries no end date."""

DEFAULT_PENULTIMATE_DAYS = 7
"""`civilDateOffset(endDate, -7)`: the penultimate module ends a week before."""

MAX_GUIDE_TEXT_CHARS = 4_000


def mock_exam_duration_minutes(exam_format: Any) -> int:
    """`mockExamDurationMinutes`: the stored duration, the normative default otherwise."""
    parsed = domain.propose_exam_format(exam_format, None)
    return int(parsed["durationMin"])


def _start_ms(day: str, time: str, time_zone: str) -> int:
    """`localTimeToInstant`: the instant the zone reads `time` on `day`, ADR-0277 included."""
    return shared_time.local_time_to_shifted_instant(day, time, time_zone)


async def _ensure_slot(
    tx: Any,
    *,
    user_id: str,
    formation_id: str,
    position: int,
    date: str,
    duration_min: int,
    time_zone: str,
    formation_title: str,
    now: str,
) -> dict[str, Any] | None:
    """Reconciles one of the two slots: create, re-date the planner one, never touch a moved one."""
    start_ms = _start_ms(date, MOCK_EXAM_START_TIME, time_zone)
    starts_at = to_iso(from_epoch_ms(start_ms))
    ends_at = to_iso(from_epoch_ms(start_ms + duration_min * 60_000))
    planner_key = f"mock-exam:{formation_id}:{position}"
    title = f"Examen blanc {position} \u2014 {formation_title}"
    slot_id = await queries.read_mock_exam_slot(tx, user_id, planner_key)
    if slot_id is None:
        slot_id = await queries.insert_mock_exam_slot(
            tx,
            user_id=user_id,
            formation_id=formation_id,
            title=title,
            starts_at=starts_at,
            ends_at=ends_at,
            planner_key=planner_key,
        )
    else:
        await queries.update_mock_exam_slot(
            tx, slot_id=slot_id, title=title, starts_at=starts_at, ends_at=ends_at, now=now
        )
    if slot_id is None:
        return None
    stored = await queries.read_slot_times(tx, slot_id)
    if stored is None:
        return None
    return {
        "position": position,
        "date": date,
        "startsAt": to_iso(stored["starts_at"]),
        "endsAt": to_iso(stored["ends_at"]),
        "durationMin": duration_min,
        "slotId": slot_id,
    }


async def ensure_mock_exam_slots(
    deps: AssessmentDeps, actor: Actor, formation_id: str
) -> list[dict[str, Any]]:
    """BR-PRA-05 - a formation with the `exam` objective always carries its two mock exams."""
    now = deps.clock.now()
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_mock_exam_slots(tx, user_id, formation_id)
        formation = await queries.read_mock_exam_formation(tx, user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", texts.EXAM_FORMATION_NOT_FOUND)
        objectives = list(formation["objectives"] or [])
        if "exam" not in objectives or formation["status"] != "active":
            return []
        modules = await queries.read_mock_exam_modules(tx, formation_id)
        if not modules:
            return []
        time_zone = str(formation["timezone"])
        end_date = formation["end_date"]
        if end_date is None:
            end_date = add_days(local_date_of(to_iso(now), time_zone), DEFAULT_FORMATION_DAYS)
        has_two = len(modules) >= 2
        penultimate = modules[-2] if has_two else None
        penultimate_date = (
            penultimate["planned_end"]
            if penultimate is not None and penultimate["planned_end"] is not None
            else add_days(str(end_date), -DEFAULT_PENULTIMATE_DAYS if has_two else 0)
        )
        entries: list[tuple[int, str]] = (
            [(1, str(penultimate_date)), (2, str(end_date))] if has_two else [(2, str(end_date))]
        )
        duration_min = mock_exam_duration_minutes(formation["exam_format"])
        scheduled: list[dict[str, Any]] = []
        for position, date in entries:
            slot = await _ensure_slot(
                tx,
                user_id=user_id,
                formation_id=formation_id,
                position=position,
                date=date,
                duration_min=duration_min,
                time_zone=time_zone,
                formation_title=str(formation["title"]),
                now=to_iso(now),
            )
            if slot is not None:
                scheduled.append(slot)
        return scheduled


def module_dto(module: Mapping[str, Any]) -> dict[str, Any]:
    """`moduleDto`: the identity of one module in the introduction."""
    return {
        "moduleId": str(module["module_id"]),
        "position": int(module["position"]),
        "label": str(module["label"]),
    }


def guide_of(guide: Mapping[str, Any] | None) -> Mapping[str, Any] | None:
    """`proposeExamFormat` reads only the identity and the metadata of the guide."""
    if guide is None:
        return None
    return {"id": str(guide["id"]), "metadata": guide["metadata"]}


async def get_exam_intro(deps: AssessmentDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """EF-1, EF-5 - the introduction of the mock exam of one formation."""
    await ensure_mock_exam_slots(deps, actor, formation_id)
    now = deps.clock.now()
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        formation = await queries.read_exam_formation(tx, user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", texts.EXAM_FORMATION_NOT_FOUND)
        guide = await queries.read_exam_guide(tx, formation_id)
        format_value = domain.propose_exam_format(formation["exam_format"], guide_of(guide))
        modules = await queries.read_exam_modules(tx, user_id, formation_id)
        studied_modules: list[dict[str, Any]] = []
        diagnostic_modules: list[dict[str, Any]] = []
        for module in modules:
            studied = domain.is_studied_module(str(module["status"]), int(module["seen_count"]))
            (studied_modules if studied else diagnostic_modules).append(module_dto(module))
        quotas = domain.allocate_question_counts(
            int(format_value["questionCount"]),
            [{"moduleId": str(m["module_id"]), "notionCount": int(m["notion_count"])} for m in modules],
        )
        diagnostic_question_count = sum(
            quotas.get(str(module["moduleId"]), 0) for module in diagnostic_modules
        )
        next_exams = [
            {"startsAt": to_iso(row["starts_at"]), "label": str(row["title"])}
            for row in await queries.read_exam_next_slots(tx, user_id, formation_id, to_iso(now))
        ]
        last = await queries.read_exam_last_attempt(tx, user_id, formation_id)
        return {
            "formationId": formation_id,
            "title": str(formation["title"]),
            "format": domain.format_dto(format_value),
            "hasGuide": guide is not None,
            "studiedModules": studied_modules,
            "diagnosticModules": diagnostic_modules,
            "diagnosticQuestionCount": diagnostic_question_count,
            "nextExams": next_exams,
            "lastAttempt": None
            if last is None
            else {
                "attemptId": str(last["id"]),
                "status": str(last["status"]),
                "score": None if last["score"] is None else float(last["score"]),
            },
        }


async def confirm_exam_format(deps: AssessmentDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """ET-3 - records the learner confirmation and returns the confirmed format."""
    now = deps.clock.now()
    user_id = actor.user_id
    async with deps.db.user_tx(actor) as tx:
        formation = await queries.read_exam_formation(tx, user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", texts.EXAM_FORMATION_NOT_FOUND)
        guide = await queries.read_exam_guide(tx, formation_id)
        format_value = domain.propose_exam_format(formation["exam_format"], guide_of(guide))
        stored: dict[str, Any] = {
            "questions": int(format_value["questionCount"]),
            "durationMin": int(format_value["durationMin"]),
            "threshold": int(format_value["threshold"]),
            "confirmed": True,
        }
        if format_value.get("sourceResourceId") is not None:
            stored["sourceResourceId"] = format_value["sourceResourceId"]
        await queries.update_exam_format(
            tx, formation_id, json.dumps(stored, ensure_ascii=False), to_iso(now)
        )
        confirmed = {**format_value, "confirmed": True}
        return domain.format_dto(confirmed)


__all__ = [
    "MOCK_EXAM_START_TIME",
    "confirm_exam_format",
    "ensure_mock_exam_slots",
    "get_exam_intro",
    "mock_exam_duration_minutes",
    "module_dto",
]
