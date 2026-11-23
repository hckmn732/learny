"""Agenda move and BR-FOR-14 replanning (SPEC-705, BR-AGE-05, ADR-0029, ADR-0326).

Port of `packages/services/src/agenda-deplacer-et-reajuster-le-planning.ts`: every availability,
local hour and projected end date comes from the pure planner of SPEC-407 (`find_compatible_slots`,
`plan_schedule`). The service only reads the learner's rows behind RLS, persists the committed
transition (old slot `moved`, new slot with `moved_from_id`, replay-safe automation action) and
emits the domain events after the commit. A content version guards stale moves and stale plans.
"""

import hashlib
import json
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.identity.domain.actor import Actor
from learny.learning.application.ports import LearningDeps
from learny.learning.domain.params import ENGINE
from learny.learning.domain.planner import (
    find_compatible_slots,
    plan_schedule,
)
from learny.learning.domain.time import add_days, days_between, local_date_of
from learny.learning.infrastructure import queries
from learny.shared import time as shared_time
from learny.shared.errors import AppError
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import learning as texts
from learny.shared.time import to_iso

DEFAULT_MODULE_HOURS = 2
FALLBACK_HORIZON_DAYS = 120
PLANNING_AUTOMATION = "reprise"
LIGHTEN_RATIO = 0.1
MOVE_WINDOW_DAYS = 3
SLOT_KINDS = (
    "contributions",
    "course",
    "exercise",
    "validation_quiz",
    "global_quiz",
    "revision",
    "buffer",
    "sprint",
    "mock_exam",
    "warmup",
    "micro_session",
    "weekly_review",
)
SLOT_STATUSES = ("planned", "done", "missed", "moved", "cancelled")
SLOT_CREATORS = ("planner", "automation", "learner")
PREFERRED_SLOTS = ("matin", "apres_midi", "soir")


def _epoch(value: Any) -> int:
    """Epoch milliseconds of an instant read from the database or sent by the browser."""
    if isinstance(value, str):
        return shared_time.to_epoch_ms(shared_time.parse_iso(value))
    if isinstance(value, datetime):
        return shared_time.to_epoch_ms(value)
    raise TypeError(f"not an instant: {value!r}")


def _iso(value: Any) -> str:
    """A database instant (datetime or string) as a canonical ISO string."""
    return to_iso(shared_time.from_epoch_ms(_epoch(value)))


def _instant(value: Any) -> str:
    return _iso(value)


def _minutes_of_window(starts_at: str, ends_at: str) -> int:
    return max(0, js_round((_epoch(ends_at) - _epoch(starts_at)) / 60_000))


def _assert_uuid(value: str, field: str) -> str:
    """CL-1 \u2014 an identifier outside the schema is refused before any read or write."""
    from learny.learning.application.final_review import is_uuid

    if not is_uuid(value):
        raise AppError(
            "VALIDATION_FAILED",
            texts.PLANNING_INVALID_FIELD.format(field=field),
            errors=[{"path": field, "message": texts.PLANNING_UUID_EXPECTED}],
        )
    return value


def _sha16(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def slot_version_of(row: Mapping[str, Any]) -> str:
    """CL-2 \u2014 content version of one slot, independent of the frozen test clock."""
    canonical = "|".join(
        [str(row["id"]), _instant(row["starts_at"]), _instant(row["ends_at"]), str(row["status"])]
    )
    return f"slot-{_sha16(canonical)}"


def _number(value: Any) -> Any:
    """A JSON number identical to `JSON.stringify`: integers stay integers."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    number = float(value)
    return int(number) if number.is_integer() else number


def plan_version_of(parts: Mapping[str, Any]) -> str:
    """ET-4, CL-2 \u2014 deterministic plan version, hashed from the content, not `updated_at`."""
    formation = parts["formation"]
    modules = sorted(
        (
            [str(module["module_id"]), str(module["status"]), module["planned_end"]]
            for module in parts["modules"]
        ),
        key=lambda item: item[0],
    )
    slots = sorted(
        (
            [
                str(slot["id"]),
                _instant(slot["starts_at"]),
                _instant(slot["ends_at"]),
                str(slot["status"]),
            ]
            for slot in parts["slots"]
        ),
        key=lambda item: item[0],
    )
    canonical = json.dumps(
        {
            "formation": {
                "id": str(formation["id"]),
                "endDate": formation["end_date"],
                "volumeHours": _number(formation["volume_hours"]),
            },
            "modules": modules,
            "slots": slots,
            "hoursPerDay": _number(parts["hoursPerDay"]),
            "studyDays": sorted(int(day) for day in parts["studyDays"]),
        },
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return f"plan-{_sha16(canonical)}"


def current_plan_version(context: Mapping[str, Any]) -> str:
    """ET-4 \u2014 the plan version of the read snapshot."""
    return plan_version_of(
        {
            "formation": context["formation"],
            "modules": context["modules"],
            "slots": context["slots"],
            "hoursPerDay": context["profile"]["hours_per_day"] or 2,
            "studyDays": study_days_of(context["profile"]),
        }
    )


def study_days_of(profile: Mapping[str, Any]) -> list[int]:
    """The stored study days, defaulting to the working week."""
    raw = profile["study_days"] or [1, 2, 3, 4, 5]
    days = []
    for value in raw:
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if 1 <= number <= 7:
            days.append(number)
    return sorted(days)


def preferred_slots_of(profile: Mapping[str, Any]) -> list[str]:
    """The preferred study moments, `soir` when nothing usable remains."""
    raw = [str(item) for item in (profile["preferred_slots"] or ["soir"])]
    kept = [item for item in raw if item in PREFERRED_SLOTS]
    return kept if kept else ["soir"]


def _planner_modules(modules: Sequence[Mapping[str, Any]], hours: int) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in modules:
        entry = grouped.setdefault(str(row["module_id"]), {"module": row, "chapters": []})
        if row["chapter_id"] is not None:
            chapter: dict[str, Any] = {
                "chapterId": row["chapter_id"],
                "position": int(row["chapter_position"] or 1),
            }
            if row["chapter_title"] is not None:
                chapter["title"] = row["chapter_title"]
            entry["chapters"].append(chapter)
    ordered = sorted(grouped.values(), key=lambda item: int(item["module"]["position"]))
    result = []
    for entry in ordered:
        module = entry["module"]
        item: dict[str, Any] = {
            "moduleId": module["module_id"],
            "position": int(module["position"]),
            "title": module["title"],
            "hours": hours,
            "chapters": sorted(entry["chapters"], key=lambda chapter: chapter["position"]),
            "status": module["status"],
        }
        if module["planned_end"] is not None:
            item["deadline"] = module["planned_end"]
        result.append(item)
    return result


def _existing_planner_slots(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "slotId": row["id"],
            "formationId": row["formation_id"],
            "moduleId": row["module_id"],
            "kind": row["kind"],
            "title": row["title"],
            "startsAt": _instant(row["starts_at"]),
            "endsAt": _instant(row["ends_at"]),
            "status": row["status"],
            "createdBy": (row["created_by"] if row["created_by"] in ("automation", "learner") else "planner"),
            "movedFromId": row["moved_from_id"],
        }
        for row in rows
        if row["status"] != "cancelled"
    ]


def _planner_formation(context: Mapping[str, Any], end_date: str) -> dict[str, Any]:
    module_count = len({str(module["module_id"]) for module in context["modules"]})
    volume = context["formation"]["volume_hours"]
    hours = (
        DEFAULT_MODULE_HOURS
        if module_count == 0
        else max(
            1,
            js_round((volume if volume is not None else module_count * DEFAULT_MODULE_HOURS) / module_count),
        )
    )
    objectives = [
        objective
        for objective in (context["formation"]["objectives"] or [])
        if objective in ("operational", "exam", "dialogue", "project")
    ]
    return {
        "formationId": context["formation"]["id"],
        "title": context["formation"]["title"],
        "endDate": end_date,
        "status": "active",
        "objectives": objectives,
        "modules": _planner_modules(context["modules"], hours),
    }


def plan_input_of(
    context: Mapping[str, Any],
    now: datetime,
    *,
    end_date: str | None = None,
    hours_per_day: int | None = None,
    slots: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """ET-5 \u2014 the planner input of one formation; overrides only change the previewed scenario."""
    timezone = str(context["profile"]["timezone"])
    resolved_end = (
        end_date
        or context["formation"]["end_date"]
        or add_days(local_date_of(to_iso(now), timezone), FALLBACK_HORIZON_DAYS)
    )
    return {
        "formations": [_planner_formation(context, str(resolved_end))],
        "preferences": {
            "tz": timezone,
            "availability": {
                "hoursPerDay": (
                    hours_per_day if hours_per_day is not None else (context["profile"]["hours_per_day"] or 2)
                ),
                "studyDays": [day for day in study_days_of(context["profile"]) if 1 <= day <= 7],
                "preferredSlots": preferred_slots_of(context["profile"]),
            },
        },
        "params": ENGINE["planner"],
        "existingSlots": _existing_planner_slots(context["slots"] if slots is None else slots),
        "now": to_iso(now),
    }


def blocked_module_of(
    *,
    modules: Sequence[Mapping[str, Any]],
    slots: Sequence[Mapping[str, Any]],
    today: str,
    now: datetime,
    planner_blocked: Sequence[str] | None = None,
    delay_days: int | None = None,
) -> dict[str, Any] | None:
    """EF-2 \u2014 the first module blocked by BR-FOR-14, in programme order."""
    delay = int(ENGINE["planner"]["blockedDelayDays"]) if delay_days is None else delay_days
    cutoff = add_days(today, -delay)
    ordered = sorted(modules, key=lambda module: (int(module["position"]), str(module["module_id"])))
    for module in ordered:
        if module["status"] == "validated":
            continue
        planner_says = planner_blocked is not None and str(module["module_id"]) in planner_blocked
        delayed = module["planned_end"] is not None and str(module["planned_end"]) <= cutoff
        failed_quiz = any(
            slot["module_id"] == module["module_id"]
            and slot["kind"] == "validation_quiz"
            and slot["status"] == "missed"
            for slot in slots
        )
        has_margin = any(
            slot["module_id"] == module["module_id"]
            and slot["kind"] == "buffer"
            and slot["status"] == "planned"
            and _epoch(slot["starts_at"]) > _epoch(now)
            for slot in slots
        )
        if planner_says or delayed or (failed_quiz and not has_margin):
            return {
                "formationId": module["formation_id"],
                "moduleId": module["module_id"],
                "moduleNumber": int(module["position"]),
                "title": module["title"],
                "reason": "quiz_failed" if failed_quiz and not has_margin else "delayed",
            }
    return None


def _projected_end_of(plan: Mapping[str, Any], formation_id: str) -> str | None:
    for deadline in plan["deadlines"]:
        if deadline["formationId"] == formation_id:
            value = deadline["projectedEndDate"]
            return None if value is None else str(value)
    return None


def _planner_options_of(plan: Mapping[str, Any], formation_id: str) -> list[dict[str, Any]]:
    return [option for option in plan["options"] if option["formationId"] == formation_id]


def _option_dto(option: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "kind": option["kind"],
        "feasible": option["feasible"],
        "reason": option["reason"],
        "currentEndDate": option["currentEndDate"],
        "projectedEndDate": option["projectedEndDate"],
        "extraDays": option["extraDays"],
        "currentHoursPerDay": option["currentHoursPerDay"],
        "newHoursPerDay": option["newHoursPerDay"],
        "removedMinutes": option["removedMinutes"],
    }


def preview_options_of(
    context: Mapping[str, Any],
    plan: Mapping[str, Any],
    now: datetime,
    hours_per_day: int,
) -> list[dict[str, Any]]:
    """Three deterministic previews when the deadline is not missed but a module is blocked."""
    timezone = str(context["profile"]["timezone"])
    end_date = context["formation"]["end_date"] or add_days(local_date_of(to_iso(now), timezone), 30)
    end_date = str(end_date)
    projected = _projected_end_of(plan, str(context["formation"]["id"])) or end_date
    extra_needed = max(0, days_between(end_date, projected))
    extra_days = max(int(ENGINE["planner"]["blockedModuleExtraDays"]), extra_needed)
    shift_end = add_days(end_date, extra_days)

    max_hours = min(int(ENGINE["planner"]["maxHoursPerDay"]), 24)
    candidate = min(int(hours_per_day) + 1, max_hours)
    volume_projected = projected
    volume_feasible = candidate > hours_per_day
    if volume_feasible:
        simulation = plan_schedule(plan_input_of(context, now, hours_per_day=candidate))
        volume_projected = _projected_end_of(simulation, str(context["formation"]["id"])) or projected
        volume_feasible = volume_projected <= end_date or volume_projected < projected

    module_count = len({str(module["module_id"]) for module in context["modules"]})
    volume = context["formation"]["volume_hours"]
    module_content = (
        DEFAULT_MODULE_HOURS * 60
        if module_count == 0
        else max(
            1,
            js_round(
                ((volume if volume is not None else len(context["modules"]) * DEFAULT_MODULE_HOURS) * 60)
                / module_count
            ),
        )
    )
    removed_minutes = max(1, js_round(module_content * LIGHTEN_RATIO))

    return [
        {
            "kind": "shift_end",
            "feasible": True,
            "reason": None,
            "currentEndDate": end_date,
            "projectedEndDate": shift_end if shift_end > projected else projected,
            "extraDays": extra_days,
            "currentHoursPerDay": hours_per_day,
            "newHoursPerDay": None,
            "removedMinutes": None,
        },
        {
            "kind": "increase_volume",
            "feasible": volume_feasible,
            "reason": None if volume_feasible else texts.PLANNING_VOLUME_MAX,
            "currentEndDate": end_date,
            "projectedEndDate": volume_projected,
            "extraDays": None,
            "currentHoursPerDay": hours_per_day,
            "newHoursPerDay": candidate,
            "removedMinutes": None,
        },
        {
            "kind": "lighten",
            "feasible": True,
            "reason": None,
            "currentEndDate": end_date,
            "projectedEndDate": projected,
            "extraDays": None,
            "currentHoursPerDay": hours_per_day,
            "newHoursPerDay": None,
            "removedMinutes": removed_minutes,
        },
    ]


def normalize_options(options: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Always three entries, one per BR-FOR-14 option, in the presentation order."""
    order = ("shift_end", "increase_volume", "lighten")
    result: list[dict[str, Any]] = []
    first = options[0] if options else None
    for kind in order:
        found = next((option for option in options if option["kind"] == kind), None)
        if found is not None:
            result.append(dict(found))
            continue
        result.append(
            {
                "kind": kind,
                "feasible": False,
                "reason": texts.PLANNING_OPTION_UNAVAILABLE,
                "currentEndDate": (first["currentEndDate"] if first is not None else "2026-01-01"),
                "projectedEndDate": None,
                "extraDays": None,
                "currentHoursPerDay": (first["currentHoursPerDay"] if first is not None else 1),
                "newHoursPerDay": None,
                "removedMinutes": None,
            }
        )
    return result


def options_for(context: Mapping[str, Any], now: datetime) -> dict[str, Any]:
    """The planner plan, the blocked module and the three normalised options."""
    plan = plan_schedule(plan_input_of(context, now))
    deadline = next(
        (entry for entry in plan["deadlines"] if entry["formationId"] == context["formation"]["id"]),
        None,
    )
    today = local_date_of(to_iso(now), str(context["profile"]["timezone"]))
    blocked = blocked_module_of(
        modules=context["modules"],
        slots=context["slots"],
        today=today,
        now=now,
        planner_blocked=None if deadline is None else deadline.get("blockedModules"),
    )
    if blocked is None:
        return {"plan": plan, "blocked": None, "options": []}
    planner_options = [
        _option_dto(option) for option in _planner_options_of(plan, str(context["formation"]["id"]))
    ]
    options = (
        planner_options
        if planner_options
        else preview_options_of(context, plan, now, int(context["profile"]["hours_per_day"] or 2))
    )
    return {"plan": plan, "blocked": blocked, "options": normalize_options(options)}


async def _read_planning_context_tx(
    tx: Any, actor: Actor, formation_id: str, now: datetime
) -> dict[str, Any]:
    """The planner snapshot inside an already open transaction."""
    profile = await queries.read_planning_profile(tx, actor.user_id)
    if profile is None:
        raise AppError("NOT_FOUND", texts.PLANNING_PROFILE_NOT_FOUND)
    formation = await queries.read_planning_formation(tx, actor.user_id, formation_id)
    if formation is None:
        raise AppError("NOT_FOUND", texts.PLANNING_FORMATION_NOT_FOUND)
    modules = await queries.read_planning_modules(tx, formation_id)
    since = to_iso(shared_time.from_epoch_ms(shared_time.to_epoch_ms(now) - 86_400_000))
    slots = await queries.read_planning_slots(tx, actor.user_id, since)
    return {"profile": profile, "formation": formation, "modules": modules, "slots": slots}


async def read_planning_context(
    deps: LearningDeps, actor: Actor, formation_id: str, now: datetime
) -> dict[str, Any]:
    """Reads the rows the planner needs for one formation, with the agenda's visibility."""
    async with deps.db.user_tx(actor) as tx:
        return await _read_planning_context_tx(tx, actor, formation_id, now)


def _alternative_reasons(
    moment: str,
    date: str,
    context: Mapping[str, Any],
    formation_end: str | None,
) -> list[str]:
    reasons = [texts.PLANNING_REASON_STUDY_DAY, texts.PLANNING_REASON_FREE]
    if moment in preferred_slots_of(context["profile"]):
        reasons.append(
            texts.PLANNING_REASON_MORNING
            if moment == "matin"
            else texts.PLANNING_REASON_AFTERNOON
            if moment == "apres_midi"
            else texts.PLANNING_REASON_EVENING
        )
    if formation_end is not None and date <= formation_end:
        reasons.append(texts.PLANNING_REASON_IN_DATES)
    return reasons


async def get_slot_alternatives(deps: LearningDeps, actor: Actor, slot_id: str) -> dict[str, Any]:
    """EF-1, ET-3 \u2014 three next compatible windows for one future slot, with its version."""
    _assert_uuid(slot_id, "params.sid")
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        slot = await queries.read_slot_of_user(tx, actor.user_id, slot_id)
        if slot is None:
            raise AppError("NOT_FOUND", texts.PLANNING_SLOT_NOT_FOUND)
        if slot["status"] != "planned" or _epoch(slot["starts_at"]) <= _epoch(now):
            raise AppError("CONFLICT", texts.PLANNING_SLOT_NOT_MOVABLE)
        if slot["formation_id"] is None:
            raise AppError("CONFLICT", texts.PLANNING_SLOT_WITHOUT_FORMATION)
    context = await read_planning_context(deps, actor, str(slot["formation_id"]), now)
    timezone = str(context["profile"]["timezone"])
    duration_minutes = _minutes_of_window(_instant(slot["starts_at"]), _instant(slot["ends_at"]))
    planner_calendar = {
        "now": to_iso(now),
        "params": ENGINE["planner"],
        "slots": _existing_planner_slots(context["slots"]),
    }
    compatible = find_compatible_slots(
        {
            "durationMinutes": duration_minutes,
            "kind": slot["kind"],
            "formationId": slot["formation_id"],
            "moduleId": slot["module_id"],
            "title": slot["title"],
        },
        planner_calendar,
        {
            "tz": timezone,
            "availability": plan_input_of(context, now)["preferences"]["availability"],
        },
        12,
    )
    formation_end = context["formation"]["end_date"]
    alternatives = []
    for candidate in compatible:
        if formation_end is not None and candidate["date"] > formation_end:
            continue
        wall_start = _wall(candidate["startsAt"], timezone)
        wall_end = _wall(candidate["endsAt"], timezone)
        alternatives.append(
            {
                "date": candidate["date"],
                "startsAt": candidate["startsAt"],
                "endsAt": candidate["endsAt"],
                "startMinutes": wall_start.hour * 60 + wall_start.minute,
                "endMinutes": wall_end.hour * 60 + wall_end.minute,
                "moment": candidate["moment"],
                "reasons": _alternative_reasons(
                    candidate["moment"], candidate["date"], context, formation_end
                ),
            }
        )
        if len(alternatives) == 3:
            break
    return {
        "slotId": slot_id,
        "version": slot_version_of(slot),
        "timezone": timezone,
        "durationMinutes": duration_minutes,
        "day": local_date_of(_instant(slot["starts_at"]), timezone),
        "alternatives": alternatives,
    }


def _wall(instant: str, timezone: str) -> datetime:
    return shared_time.from_epoch_ms(shared_time.wall_ms_of(_epoch(instant), timezone))


def _local_label(starts_at: str, timezone: str) -> str:
    wall = _wall(starts_at, timezone)
    return f"{wall.year:04d}-{wall.month:02d}-{wall.day:02d} {wall.hour:02d}:{wall.minute:02d}"


async def _move_in_transaction(
    deps: LearningDeps,
    actor: Actor,
    slot_id: str,
    body: Mapping[str, Any],
    now: datetime,
) -> dict[str, Any]:
    now_iso = to_iso(now)
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_agenda_move(tx, actor.user_id)
        slot = await queries.read_slot_of_user(tx, actor.user_id, slot_id)
        if slot is None:
            raise AppError("NOT_FOUND", texts.PLANNING_SLOT_NOT_FOUND)
        if slot["status"] == "moved":
            planned_version = slot_version_of({**slot, "status": "planned"})
            if planned_version == body["expectedVersion"]:
                successor = await queries.read_moved_successor(tx, slot_id)
                if successor is not None:
                    return {
                        "movedSlotId": successor,
                        "explanation": texts.PLANNING_MOVED_ALREADY,
                        "created": False,
                    }
            raise AppError("CONFLICT", texts.PLANNING_SLOT_NOT_MOVABLE)
        if slot["status"] != "planned" or _epoch(slot["starts_at"]) <= _epoch(now_iso):
            raise AppError("CONFLICT", texts.PLANNING_SLOT_NOT_MOVABLE)
        if slot_version_of(slot) != body["expectedVersion"]:
            raise AppError("CONFLICT", texts.PLANNING_PLAN_CHANGED)
        starts_at = _instant(body["startsAt"])
        ends_at = _instant(body["endsAt"])
        if _epoch(starts_at) <= _epoch(now_iso):
            raise AppError(
                "VALIDATION_FAILED",
                texts.PLANNING_MOVE_FUTURE,
                errors=[{"path": "body.startsAt", "message": texts.PLANNING_MOVE_FUTURE_HINT}],
            )
        if _minutes_of_window(starts_at, ends_at) != _minutes_of_window(
            _instant(slot["starts_at"]), _instant(slot["ends_at"])
        ):
            raise AppError(
                "VALIDATION_FAILED",
                texts.PLANNING_MOVE_DURATION,
                errors=[{"path": "body.endsAt", "message": texts.PLANNING_MOVE_DURATION_HINT}],
            )
        if await queries.read_overlapping_slot(tx, actor.user_id, slot_id, starts_at, ends_at):
            raise AppError(
                "CONFLICT",
                texts.PLANNING_MOVE_OVERLAP,
                errors=[{"path": "body.startsAt", "message": texts.PLANNING_MOVE_OVERLAP_HINT}],
            )
        moved_slot_id = str(_uuid4())
        await queries.mark_slot_moved(tx, actor.user_id, slot_id, now_iso)
        stored = await queries.insert_moved_slot(
            tx,
            slot_id=moved_slot_id,
            user_id=actor.user_id,
            formation_id=str(slot["formation_id"]),
            module_id=None if slot["module_id"] is None else str(slot["module_id"]),
            kind=str(slot["kind"]),
            title=str(slot["title"]),
            meta=slot["meta"],
            starts_at=starts_at,
            ends_at=ends_at,
            activity_id=None if slot["activity_id"] is None else str(slot["activity_id"]),
            moved_from_id=slot_id,
            group_milestone=bool(slot["group_milestone"]),
            now=now_iso,
        )
        if stored is None:
            raise AppError("INTERNAL_ERROR", texts.PLANNING_MOVE_FAILED)
        timezone = await queries.read_timezone(tx, actor.user_id)
        label = _local_label(starts_at, timezone or "Europe/Paris")
        return {
            "movedSlotId": stored,
            "explanation": texts.PLANNING_MOVED_LABEL.format(label=label),
            "created": True,
        }


def _uuid4() -> Any:
    import uuid

    return uuid.uuid4()


async def _refreshed_agenda(
    deps: LearningDeps, actor: Actor, starts_at: str, timezone: str
) -> dict[str, Any]:
    from learny.learning.application.agenda import get_agenda

    day = local_date_of(starts_at, timezone)
    return await get_agenda(
        deps,
        actor,
        {
            "from": add_days(day, -MOVE_WINDOW_DAYS),
            "to": add_days(day, MOVE_WINDOW_DAYS),
            "formation": "all",
        },
    )


async def move_slot(
    deps: LearningDeps, actor: Actor, slot_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """ET-3 \u2014 moves one future activity and returns the refreshed agenda around its new day."""
    _assert_uuid(slot_id, "params.sid")
    now = deps.clock.now()
    moved = await _move_in_transaction(deps, actor, slot_id, body, now)
    timezone = "Europe/Paris"
    async with deps.db.user_tx(actor) as tx:
        stored_timezone = await queries.read_timezone(tx, actor.user_id)
        if stored_timezone is not None:
            timezone = stored_timezone
    agenda = await _refreshed_agenda(deps, actor, str(body["startsAt"]), timezone)
    moved_slot = next((slot for slot in agenda["slots"] if slot["id"] == moved["movedSlotId"]), None)
    if moved_slot is None:
        raise AppError("INTERNAL_ERROR", texts.PLANNING_MOVED_MISSING)
    if moved["created"]:
        async with deps.db.user_tx(actor) as tx:
            await tx.emit(
                "agenda/slot-moved",
                {
                    "userId": actor.user_id,
                    "slotId": slot_id,
                    "newSlotId": moved["movedSlotId"],
                    "formationId": moved_slot["formationId"],
                    "startsAt": moved_slot["startsAt"],
                },
                event_id=f"agenda-move:{slot_id}",
            )
    return {
        "movedSlot": moved_slot,
        "replacedSlotId": slot_id,
        "version": slot_version_of(
            {
                "id": moved_slot["id"],
                "starts_at": moved_slot["startsAt"],
                "ends_at": moved_slot["endsAt"],
                "status": moved_slot["status"],
            }
        ),
        "explanation": moved["explanation"],
        "agenda": agenda,
    }


async def get_replan_options(deps: LearningDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """ET-4 \u2014 the three scenarios and their preview, without any write."""
    _assert_uuid(formation_id, "params.fid")
    now = deps.clock.now()
    context = await read_planning_context(deps, actor, formation_id, now)
    computed = options_for(context, now)
    return {
        "formationId": formation_id,
        "planVersion": current_plan_version(context),
        "blocked": computed["blocked"],
        "currentEndDate": context["formation"]["end_date"]
        or add_days(local_date_of(to_iso(now), str(context["profile"]["timezone"])), 30),
        "currentHoursPerDay": context["profile"]["hours_per_day"] or 2,
        "options": computed["options"],
    }


def _replan_explanation(choice: str, option: Mapping[str, Any], end_date: str) -> str:
    if choice == "shift_end":
        return texts.PLANNING_SHIFT_EXPLANATION.format(date=end_date)
    if choice == "increase_volume":
        return texts.PLANNING_VOLUME_EXPLANATION.format(hours=_js_number(option["newHoursPerDay"]))
    return texts.PLANNING_LIGHTEN_EXPLANATION.format(minutes=option["removedMinutes"])


def _js_number(value: Any) -> str:
    """`String(number)`: an integral float prints without its decimal part."""
    number = float(value)
    return str(int(number)) if number.is_integer() else str(number)


async def _apply_replan_in_transaction(
    deps: LearningDeps,
    actor: Actor,
    formation_id: str,
    body: Mapping[str, Any],
    now: datetime,
) -> dict[str, Any]:
    now_iso = to_iso(now)
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_agenda_replan(tx, actor.user_id, formation_id)
        context = await _read_planning_context_tx(tx, actor, formation_id, now)
        version = current_plan_version(context)
        hours = int(context["profile"]["hours_per_day"] or 2)
        end_date = context["formation"]["end_date"]
        if version != body["expectedPlanVersion"]:
            raise AppError("CONFLICT", texts.PLANNING_PLAN_CHANGED)
        computed = options_for(context, now)
        if computed["blocked"] is None:
            raise AppError("CONFLICT", texts.PLANNING_NO_BLOCKED_MODULE)
        chosen = next(
            (option for option in computed["options"] if option["kind"] == body["choice"]),
            None,
        )
        if chosen is None or not chosen["feasible"]:
            raise AppError(
                "CONFLICT",
                (
                    chosen["reason"]
                    if chosen is not None and chosen["reason"]
                    else texts.PLANNING_OPTION_INFEASIBLE
                ),
            )
        if body["choice"] == "lighten":
            return {
                "outcome": "consent_required",
                "explanation": _replan_explanation("lighten", chosen, end_date or ""),
                "endDate": end_date,
                "hoursPerDay": hours,
            }
        next_end = end_date
        next_hours = hours
        if body["choice"] == "shift_end":
            next_end = chosen["projectedEndDate"] or end_date
            if next_end is None or next_end == end_date:
                return {
                    "outcome": "unchanged",
                    "explanation": texts.PLANNING_UNCHANGED_END,
                    "endDate": end_date,
                    "hoursPerDay": hours,
                }
            await queries.update_formation_end_date(tx, actor.user_id, formation_id, str(next_end), now_iso)
        else:
            next_hours = int(chosen["newHoursPerDay"] or hours)
            if next_hours <= hours:
                return {
                    "outcome": "unchanged",
                    "explanation": texts.PLANNING_UNCHANGED_HOURS,
                    "endDate": end_date,
                    "hoursPerDay": hours,
                }
            await queries.update_hours_per_day(tx, actor.user_id, next_hours, now_iso)
        refreshed = await _read_planning_context_tx(tx, actor, formation_id, now)
        replanned = plan_schedule(plan_input_of(refreshed, now))
        await reconcile_plan_slots(tx, actor.user_id, formation_id, replanned["slots"], now)
        return {
            "outcome": "applied",
            "explanation": _replan_explanation(body["choice"], chosen, str(next_end or "")),
            "endDate": next_end,
            "hoursPerDay": next_hours,
        }


async def reconcile_plan_slots(
    tx: Any,
    user_id: str,
    formation_id: str,
    slots: Sequence[Mapping[str, Any]],
    now: datetime,
) -> dict[str, int]:
    """SPEC-618 ET-2 \u2014 reconciles the planner slots of one formation, replay-safe."""
    now_iso = to_iso(now)
    existing = await queries.read_planner_slots_of_plan(tx, user_id, formation_id)
    by_key = {str(row["planner_key"]): row for row in existing if row["planner_key"] is not None}
    future = [
        slot
        for slot in slots
        if slot["formationId"] == formation_id and _epoch(slot["startsAt"]) >= _epoch(now_iso)
    ]
    desired = {str(slot["slotId"]) for slot in future}
    created = updated = unchanged = preserved = cancelled = 0

    for slot in future:
        key = str(slot["slotId"])
        current = by_key.get(key)
        if current is None:
            await queries.insert_planner_slot(
                tx,
                user_id=user_id,
                formation_id=formation_id,
                module_id=slot["moduleId"],
                kind=str(slot["kind"]),
                title=str(slot["title"]),
                starts_at=_instant(slot["startsAt"]),
                ends_at=_instant(slot["endsAt"]),
                planner_key=key,
            )
            created += 1
            continue
        if current["status"] != "planned" or current["created_by"] != "planner":
            preserved += 1
            continue
        changed = (
            current["kind"] != slot["kind"]
            or current["title"] != slot["title"]
            or current["module_id"] != slot["moduleId"]
            or _epoch(current["starts_at"]) != _epoch(slot["startsAt"])
            or _epoch(current["ends_at"]) != _epoch(slot["endsAt"])
        )
        if not changed:
            unchanged += 1
            continue
        await queries.update_planner_slot(
            tx,
            user_id=user_id,
            slot_id=str(current["id"]),
            module_id=slot["moduleId"],
            kind=str(slot["kind"]),
            title=str(slot["title"]),
            starts_at=_instant(slot["startsAt"]),
            ends_at=_instant(slot["endsAt"]),
        )
        updated += 1

    for row in existing:
        if row["status"] != "planned" or row["created_by"] != "planner":
            continue
        if _epoch(row["starts_at"]) < _epoch(now_iso):
            continue
        if row["planner_key"] is not None and str(row["planner_key"]) in desired:
            continue
        await queries.cancel_planner_slot(tx, user_id, str(row["id"]))
        cancelled += 1
    return {
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "cancelled": cancelled,
        "preserved": preserved,
    }


async def _record_lighten_proposal(
    deps: LearningDeps,
    *,
    user_id: str,
    formation_id: str,
    explanation: str,
    expected_plan_version: str,
    now: datetime,
) -> str | None:
    """BR-AUT-11 \u2014 the lightening proposal joins the automation journal, deduplicated."""
    dedupe_key = f"replan:{formation_id}:{expected_plan_version}:lighten"
    now_iso = to_iso(now)
    action_id: str | None = None
    created = False
    async with deps.db.service_tx() as tx:
        row = await queries.insert_automation_action_quiet(
            tx,
            user_id=user_id,
            formation_id=formation_id,
            automation=PLANNING_AUTOMATION,
            kind="plan_lightened",
            summary=explanation,
            payload={
                "dedupeKey": dedupe_key,
                "choice": "lighten",
                "removedMinutes": None,
            },
            created_at=now_iso,
        )
        if row is not None:
            action_id = str(row["id"])
            created = True
        else:
            existing = await queries.read_automation_action_by_dedupe(
                tx, user_id, PLANNING_AUTOMATION, dedupe_key
            )
            if existing is None:
                raise AppError("INTERNAL_ERROR", texts.PLANNING_AUTOMATION_FAILED)
            action_id = str(existing["id"])
    if created and action_id is not None:
        async with deps.db.service_tx() as tx:
            await tx.emit(
                "automation/action-proposed",
                {"userId": user_id, "actionId": action_id, "automation": PLANNING_AUTOMATION},
                event_id=f"agenda-replan-proposed:{action_id}",
            )
    return action_id


async def apply_replan(
    deps: LearningDeps, actor: Actor, formation_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """ET-4, EF-3 \u2014 applies the explicit choice and replans future slots atomically."""
    _assert_uuid(formation_id, "params.fid")
    now = deps.clock.now()
    result = await _apply_replan_in_transaction(deps, actor, formation_id, body, now)
    context = await read_planning_context(deps, actor, formation_id, now)
    plan_version = current_plan_version(context)
    consent_action_id: str | None = None
    if result["outcome"] == "consent_required":
        consent_action_id = await _record_lighten_proposal(
            deps,
            user_id=actor.user_id,
            formation_id=formation_id,
            explanation=result["explanation"],
            expected_plan_version=str(body["expectedPlanVersion"]),
            now=now,
        )
    elif result["outcome"] == "applied":
        async with deps.db.user_tx(actor) as tx:
            await tx.emit(
                "plan/replanned",
                {
                    "userId": actor.user_id,
                    "formationId": formation_id,
                    "choice": body["choice"],
                    "planVersion": plan_version,
                },
                event_id=f"plan-replanned:{formation_id}:{body['expectedPlanVersion']}:{body['choice']}",
            )
    return {
        "outcome": result["outcome"],
        "formationId": formation_id,
        "planVersion": plan_version,
        "explanation": result["explanation"],
        "endDate": result["endDate"],
        "hoursPerDay": result["hoursPerDay"],
        "consentActionId": consent_action_id,
    }


SELECT_ACTIVE_FORMATIONS = text(
    """
    select id::text as id
    from public.formations
    where owner_id = cast(:user_id as uuid) and status = 'active'
    order by created_at asc, id asc
    """
)


async def replan_formation_in_tx(tx: Any, user_id: str, formation_id: str, now: datetime) -> None:
    """Replans one formation in place, reusing the planner and the slot reconciliation.

    Port of `replanFormationAfterResume` of `packages/services/src/planning/index.ts`: the pause
    and the module unlock share it, so no planning rule is duplicated (ADR-2011 section 4).
    """
    actor = Actor(user_id=user_id, email="", email_confirmed=True, transport="bearer")
    context = await _read_planning_context_tx(tx, actor, formation_id, now)
    planned = plan_schedule(plan_input_of(context, now))
    await reconcile_plan_slots(tx, user_id, formation_id, planned["slots"], now)


async def replan_user_in_tx(tx: Any, user_id: str, now: datetime) -> list[str]:
    """Replans every active formation of one learner (`replanUser`); one failure cancels none."""
    rows = (await tx.conn.execute(SELECT_ACTIVE_FORMATIONS, {"user_id": user_id})).mappings().all()
    replanned: list[str] = []
    for row in rows:
        formation_id = str(row["id"])
        await replan_formation_in_tx(tx, user_id, formation_id, now)
        replanned.append(formation_id)
    return replanned
