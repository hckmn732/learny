"""Home screen of the authenticated learner (SPEC-603, SPEC-2302).

One read-only aggregation under the learner's RLS, no rule and no write, so another learner's
formations, slots, attempts or memory states never reach the DTO. The local day comes from the
learner's time zone and every instant from `deps.clock.now()` (ADR-0047); the pure derivations live
in `learny.views.home_derivations` and the SQL in `learny.views.home_queries`.
"""

import math
import re
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any, TypeGuard

from learny.identity.domain.actor import Actor
from learny.learning.domain.global_quiz import build_daily_session
from learny.learning.domain.params import ENGINE
from learny.learning.domain.retention import RetentionHorizon, calculate_retention
from learny.shared import time as shared_time
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import home as texts
from learny.shared.locale_fr.details import PROFILE_NOT_FOUND
from learny.shared.naming import formation_monogram
from learny.views import home_derivations, home_queries

MS_PER_MINUTE = shared_time.MS_PER_MINUTE
DEFAULT_MODULE_THRESHOLD = home_derivations.DEFAULT_MODULE_THRESHOLD
DEFAULT_QUIZ_MINUTES = int(ENGINE["globalQuiz"]["maxMinutesDefault"])
ACTIVE_STATUSES = ("active", "paused", "programme_proposed", "cadrage")
QUIZ_FORMATS = frozenset(
    {
        "choice_question",
        "open_question",
        "cloze",
        "matching",
        "ordering",
        "categorization",
        "recall_card",
    }
)
CADRAGE_QUESTION_MAX = 5
LINE_BREAK = re.compile(r"\r?\n")


def _instant(value: Any) -> str:
    """A database instant as a canonical ISO string."""
    if isinstance(value, str):
        return shared_time.to_iso(shared_time.parse_iso(value))
    return shared_time.to_iso(value)


def _instant_ms(value: Any) -> int:
    """Epoch milliseconds of a database instant."""
    return shared_time.to_epoch_ms(shared_time.parse_iso(_instant(value)))


def _is_number(value: Any) -> TypeGuard[float | int]:
    """`typeof value === 'number'`, booleans excluded (they are not numbers in JSON)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _slot_minutes(day_slot: home_derivations.DaySlot) -> float:
    """Duration of a slot in minutes, as the JavaScript subtraction yields it."""
    return (_instant_ms(day_slot.ends_at) - _instant_ms(day_slot.starts_at)) / MS_PER_MINUTE


def _objective_text(objectives: Sequence[str]) -> str:
    """EF-6: the known objective labels of a formation, joined by a middle dot."""
    return texts.OBJECTIVE_SEPARATOR.join(home_derivations.objective_labels(list(objectives)))


def _first_line_summary(value: str) -> str:
    """First line of a description, truncated with an ellipsis past 60 characters."""
    line = LINE_BREAK.split(value, maxsplit=1)[0].strip()
    if len(line) <= home_derivations.SUMMARIZED_LINE_MAX:
        return line
    return line[: home_derivations.SUMMARIZED_LINE_MAX - 1].rstrip() + texts.ELLIPSIS


def _retention_values(horizons: Sequence[RetentionHorizon]) -> dict[str, int | None]:
    """EF-3: whole percentages at one and two months, `null` when nothing was measured."""
    one = next((horizon.rate for horizon in horizons if horizon.horizon_days == 30), None)
    two = next((horizon.rate for horizon in horizons if horizon.horizon_days == 60), None)
    return {
        "oneMonth": None if one is None else js_round(one),
        "twoMonths": None if two is None else js_round(two),
    }


def _retention_input(
    rows: Mapping[str, Sequence[Mapping[str, Any]]], formation_id: str | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """`retentionInput`: the modules of one formation (or all) and the reviews of their notions."""
    modules = [
        {
            "moduleId": str(row["module_id"]),
            "validatedAt": _instant(row["validated_at"]),
            "notionIds": [str(notion_id) for notion_id in row["notion_ids"] or []],
        }
        for row in rows["modules"]
        if formation_id is None or str(row["formation_id"]) == formation_id
    ]
    notion_ids = {notion_id for module in modules for notion_id in module["notionIds"]}
    reviews = [
        {
            "reviewId": str(row["review_id"]),
            "notionId": str(row["notion_id"]),
            "reviewedAt": _instant(row["reviewed_at"]),
            "correct": bool(row["correct"]),
        }
        for row in rows["reviews"]
        if str(row["notion_id"]) in notion_ids
    ]
    return modules, reviews


def _compute_retention(
    rows: Mapping[str, Sequence[Mapping[str, Any]]],
    now: datetime,
    time_zone: str,
    formation_id: str | None = None,
) -> dict[str, int | None]:
    """EF-3: retention of one formation, or of every formation when no identifier is given."""
    modules, reviews = _retention_input(rows, formation_id)
    return _retention_values(
        calculate_retention(
            modules,
            reviews,
            shared_time.to_iso(now),
            time_zone,
            horizons_days=ENGINE["retention"]["horizonsDays"],
            tolerance_days=ENGINE["retention"]["toleranceDays"],
        )
    )


def _action_slot(row: Mapping[str, Any]) -> home_derivations.ActionSlot:
    """The identifiers the action of a slot reads."""
    return home_derivations.ActionSlot(
        formation_id=str(row["formation_id"]),
        module_id=None if row["module_id"] is None else str(row["module_id"]),
        activity_id=None if row["activity_id"] is None else str(row["activity_id"]),
        kind=str(row["kind"]),
    )


def _scheduled_slot(row: Mapping[str, Any]) -> home_derivations.ScheduledSlot:
    """The fields the next-activity labels of a slot read."""
    return home_derivations.ScheduledSlot(
        kind=str(row["kind"]),
        starts_at=_instant(row["starts_at"]),
        meta=None if row["meta"] is None else str(row["meta"]),
    )


async def _next_quiz_day(tx: Tx, user_id: str, formation_id: str, today: str, time_zone: str) -> str:
    """`readNextQuizDay`: the civil day of the next planned quiz, tomorrow when none is planned."""
    starts_at = await home_queries.read_next_quiz_start(tx, user_id, formation_id, today, time_zone)
    if starts_at is None:
        return shared_time.add_civil_days(today, 1)
    return shared_time.user_local_day(_instant_ms(starts_at), time_zone)


async def _today_quiz_card(
    tx: Tx, user_id: str, formation: Mapping[str, Any], today: str, time_zone: str
) -> dict[str, Any] | None:
    """`readTodayQuizCard`: the stored session of the day, when it already exists (SPEC-701)."""
    formation_id = str(formation["id"])
    row = await home_queries.read_today_quiz_card(tx, user_id, formation_id, today)
    # QA SCR-03: once the session of the day is finished, the card no longer offers the notions it
    # has just reviewed; it shows the day of the next planned quiz instead.
    if row is not None and row["completed"] is True:
        return {
            "formationId": formation_id,
            "formationTitle": formation["title"],
            "notionCount": 0,
            "gamesCount": 0,
            "durationMin": 0,
            "hasGaps": False,
            "deferred": None,
            "nextReviewOn": await _next_quiz_day(tx, user_id, formation_id, today, time_zone),
        }
    config = None if row is None else row["config"]
    if not isinstance(config, dict):
        return None
    raw_items = config.get("items")
    estimated_seconds = config.get("estimatedSec")
    if not isinstance(raw_items, list) or not _is_number(estimated_seconds):
        return None
    items: list[dict[str, Any]] = []
    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue
        raw_notion_ids = raw_item.get("notionIds")
        raw_reason_key = raw_item.get("reasonKey")
        raw_format = raw_item.get("format")
        items.append(
            {
                "format": raw_format if isinstance(raw_format, str) else "",
                "notionIds": (
                    [notion_id for notion_id in raw_notion_ids if isinstance(notion_id, str)]
                    if isinstance(raw_notion_ids, list)
                    else []
                ),
                "reasonKey": raw_reason_key if isinstance(raw_reason_key, str) else None,
            }
        )
    notion_ids = {notion_id for item in items for notion_id in item["notionIds"]}
    raw_deferred_count = config.get("deferredCount")
    raw_due_count = config.get("dueCount")
    raw_deferred_to = config.get("deferredTo")
    raw_cap = config.get("capMinutes")
    deferred_count = int(raw_deferred_count) if _is_number(raw_deferred_count) else 0
    due_count = int(raw_due_count) if _is_number(raw_due_count) else len(notion_ids) + deferred_count
    deferred_to = raw_deferred_to if isinstance(raw_deferred_to, str) else None
    cap_min = js_round(float(raw_cap)) if _is_number(raw_cap) and float(raw_cap) > 0 else DEFAULT_QUIZ_MINUTES
    deferred = None
    if deferred_count != 0 and deferred_to is not None:
        deferred = {
            "dueCount": due_count,
            "deferredCount": deferred_count,
            "deferredTo": deferred_to,
            "dayLabel": home_derivations.deferred_day_label(deferred_to, today, time_zone),
            "capMin": cap_min,
        }
    return {
        "formationId": formation_id,
        "formationTitle": formation["title"],
        "notionCount": len(notion_ids),
        "gamesCount": len({item["format"] for item in items}),
        "durationMin": 0 if estimated_seconds == 0 else math.ceil(estimated_seconds / 60 / 5) * 5,
        "hasGaps": any(item["reasonKey"] is not None for item in items),
        "deferred": deferred,
        "nextReviewOn": None,
    }


def _global_quiz(
    formation: Mapping[str, Any],
    due: Sequence[Mapping[str, Any]],
    bricks: Sequence[Mapping[str, Any]],
    profile: Mapping[str, Any],
    today: str,
    now: datetime,
    time_zone: str,
    cap_minutes: int,
) -> dict[str, Any]:
    """EF-3 / ET-2: the preview of the daily global quiz of the current formation."""
    by_notion: dict[str, set[str]] = {}
    for brick in bricks:
        brick_type = str(brick["type"])
        if brick_type not in QUIZ_FORMATS:
            continue
        for notion_id in brick["notion_ids"] or []:
            by_notion.setdefault(str(notion_id), set()).add(brick_type)
    review_rows = [row for row in due if bool(row["in_review"])]
    bank = [
        {
            "notionId": str(row["notion_id"]),
            "formats": sorted(by_notion.get(str(row["notion_id"]), set())),
        }
        for row in review_rows
    ]
    # The home preview shows the daily count; gap formats are imposed by the real quiz (SPEC-701).
    session = build_daily_session(
        formation_id=str(formation["id"]),
        date=today,
        due_notions=[
            {
                "notionId": str(row["notion_id"]),
                "moduleId": str(row["module_id"]),
                "modulePosition": int(row["module_position"]),
                "moduleStatus": str(row["module_status"]),
                "evaluated": bool(row["evaluated"]),
                "dueAt": _instant(row["due_at"]),
            }
            for row in review_rows
        ],
        gaps=[],
        bank=bank,
        last_formats=[],
        cap_minutes=cap_minutes,
        mode="full",
        seed=f"home:{formation['id']}:{today}",
        params={
            "notionCostSec": ENGINE["globalQuiz"]["notionCostSec"],
            "sessionOverheadSec": ENGINE["globalQuiz"]["sessionOverheadSec"],
            "formatSeconds": ENGINE["globalQuiz"]["formatSeconds"],
            "maintenanceMaxMinutes": ENGINE["globalQuiz"]["maintenanceMaxMinutes"],
        },
    )
    items = session["items"]
    estimated_minutes = int(session["estimatedMinutes"])
    duration_min = 0 if estimated_minutes == 0 else math.ceil(estimated_minutes / 5) * 5
    deferred_count = max(0, len(due) - len(items))
    deferred = None
    if deferred_count != 0:
        tomorrow = shared_time.add_civil_days(today, 1)
        deferred = {
            "dueCount": len(due),
            "deferredCount": deferred_count,
            "deferredTo": tomorrow,
            "dayLabel": home_derivations.deferred_day_label(tomorrow, today, time_zone),
            "capMin": cap_minutes,
        }
    next_review_at = profile["next_review_at"]
    return {
        "formationId": str(formation["id"]),
        "formationTitle": formation["title"],
        "notionCount": len(items),
        "gamesCount": len({item["format"] for item in items}),
        "durationMin": duration_min,
        "hasGaps": any(item["gapNature"] is not None for item in items),
        "deferred": deferred,
        "nextReviewOn": (
            None
            if items or next_review_at is None
            else shared_time.user_local_day(_instant_ms(next_review_at), time_zone)
        ),
    }


async def _quiz_cap_minutes(tx: Tx, user_id: str) -> int:
    """`readQuizCapMinutes`: the learner's `plafond_quiz`, or the engine default."""
    params = await home_queries.read_quiz_cap_params(tx, user_id)
    candidate = params.get("maxMinutes")
    allowed = ENGINE["globalQuiz"]["allowedMaxMinutes"]
    if _is_number(candidate) and int(candidate) in allowed:
        return int(candidate)
    return DEFAULT_QUIZ_MINUTES


def _ongoing_row(
    formation: Mapping[str, Any],
    next_row: Mapping[str, Any] | None,
    now: datetime,
    time_zone: str,
    current_formation_id: str | None,
    first: bool,
) -> dict[str, Any]:
    """EF-6: one row of the ongoing tab."""
    formation_id = str(formation["id"])
    status = str(formation["status"])
    module_count = int(formation["module_count"])
    validated_count = int(formation["validated_count"])
    progress_percent = 0 if module_count == 0 else js_round(validated_count / module_count * 100)
    if status == "active":
        action = {
            "label": texts.ACTION_RESUME,
            "href": home_derivations.module_href(formation_id, formation["open_module_id"]),
        }
    elif status == "paused":
        action = {"label": texts.ACTION_RESUME, "href": f"/formations/{formation_id}/programme"}
    elif status == "programme_proposed":
        action = {"label": texts.ACTION_CONTINUE, "href": f"/formations/{formation_id}/programme"}
    else:
        action = {"label": texts.ACTION_CONTINUE, "href": f"/formations/{formation_id}/cadrage"}

    next_activity: dict[str, str] | None
    if status == "programme_proposed":
        next_activity = {
            "when": texts.NEXT_PROGRAMME_VALIDATE,
            "detail": (
                texts.NEXT_PROGRAMME_ONE_MODULE
                if module_count == 1
                else texts.NEXT_PROGRAMME_MODULES.format(count=module_count)
            ),
        }
    elif status == "cadrage":
        questions = int(formation["cadrage_questions"])
        next_activity = {
            "when": texts.NEXT_CADRAGE_FINISH,
            "detail": texts.NEXT_CADRAGE_QUESTION.format(number=min(CADRAGE_QUESTION_MAX, questions + 1)),
        }
    elif next_row is None:
        next_activity = None
    else:
        next_activity = home_derivations.next_activity(_scheduled_slot(next_row), now, time_zone)

    module_status: dict[str, str] | None = None
    if status == "active":
        raw_threshold = formation["open_module_threshold"]
        module_status = home_derivations.module_status_pill(
            contributions_in_progress=bool(formation["contributions_in_progress"]),
            course_status=(None if formation["course_status"] is None else str(formation["course_status"])),
            reading_percent=(
                None if formation["reading_percent"] is None else float(formation["reading_percent"])
            ),
            attempt_count=int(formation["attempt_count"]),
            last_score=None if formation["last_score"] is None else float(formation["last_score"]),
            threshold=(DEFAULT_MODULE_THRESHOLD if raw_threshold is None else float(raw_threshold)),
        )

    subtitle = _objective_text(formation["objectives"] or [])
    if subtitle == "":
        description = formation["description"]
        subtitle = str(description if description is not None else formation["title"])
    return {
        "id": formation_id,
        "monogram": formation_monogram(str(formation["title"]), formation["monogram"]),
        "accent": formation["accent"],
        "status": status,
        "title": formation["title"],
        "subtitle": subtitle,
        "progressPercent": progress_percent,
        "modulePosition": formation["open_module_position"],
        "moduleCount": module_count,
        "moduleTitle": formation["open_module_title"],
        "moduleStatus": module_status,
        "nextActivity": next_activity,
        "endDate": formation["end_date"],
        "action": action,
        "primaryAction": first and formation_id == current_formation_id,
    }


def _completed_row(
    formation: Mapping[str, Any], retention: Mapping[str, int | None], time_zone: str
) -> dict[str, Any]:
    """EF-7: one row of the completed tab."""
    formation_id = str(formation["id"])
    summary = home_derivations.completed_summary(
        start_date=formation["start_date"],
        completed_at=None if formation["completed_at"] is None else _instant(formation["completed_at"]),
        volume_hours=None if formation["volume_hours"] is None else int(formation["volume_hours"]),
        time_zone=time_zone,
    )
    description = (formation["description"] or "").strip()
    if description == "":
        subtitle = _objective_text(formation["objectives"] or []) or str(formation["title"])
    else:
        subtitle = _first_line_summary(description)
    maintenance_mode = formation["maintenance_mode"]
    action = (
        {"label": texts.ACTION_REVIEW, "href": f"/formations/{formation_id}/quiz-global"}
        if maintenance_mode == "light"
        else {"label": texts.ACTION_VIEW_REPORT, "href": f"/formations/{formation_id}/bilan"}
    )
    return {
        "id": formation_id,
        "monogram": formation_monogram(str(formation["title"]), formation["monogram"]),
        "accent": formation["accent"],
        "status": "completed",
        "title": formation["title"],
        "subtitle": subtitle,
        "resultPercent": formation["result_percent"],
        "retentionPercent": retention["oneMonth"],
        "dueCount": int(formation["due_count"]),
        "maintenanceMode": maintenance_mode,
        "completedOn": summary["completedOn"],
        "weeks": summary["weeks"],
        "volumeHours": summary["hours"],
        "action": action,
    }


def _day_slot(row: Mapping[str, Any]) -> home_derivations.DaySlot:
    """EF-2: the slot fields the day-card derivations read."""
    return home_derivations.DaySlot(
        id=str(row["id"]),
        kind=str(row["kind"]),
        status=str(row["status"]),
        starts_at=_instant(row["starts_at"]),
        ends_at=_instant(row["ends_at"]),
    )


def _home_slot(
    row: Mapping[str, Any],
    day_slot: home_derivations.DaySlot,
    highlight_id: str | None,
    now: datetime,
    time_zone: str,
) -> dict[str, Any]:
    """EF-2: one slot of the day card, with its state and its pill link."""
    state = home_derivations.slot_state(day_slot, now, highlight_id=highlight_id)
    return {
        "id": day_slot.id,
        "formationId": str(row["formation_id"]),
        "kind": day_slot.kind,
        "title": row["title"],
        "meta": row["meta"],
        "time": home_derivations.local_clock(day_slot.starts_at, time_zone),
        "moduleId": row["module_id"],
        "activityId": row["activity_id"],
        "startsAt": day_slot.starts_at,
        "endsAt": day_slot.ends_at,
        "status": day_slot.status,
        "state": state,
        "minutesUntil": home_derivations.minutes_until(day_slot.starts_at, now) if state == "next" else None,
        "href": home_derivations.slot_href(_action_slot(row)),
    }


async def read_home(tx: Tx, user_id: str, now: datetime) -> dict[str, Any]:
    """`readHome`: the whole home screen of one learner, inside an existing transaction."""
    now_iso = shared_time.to_iso(now)
    profile = await home_queries.read_profile(tx, user_id, now_iso)
    if profile is None:
        raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
    time_zone = str(profile["timezone"])
    today = shared_time.user_local_day(shared_time.to_epoch_ms(now), time_zone)
    bounds_start = shared_time.to_iso(
        shared_time.from_epoch_ms(shared_time.start_of_user_day(today, time_zone))
    )
    bounds_end = shared_time.to_iso(shared_time.from_epoch_ms(shared_time.end_of_user_day(today, time_zone)))
    raw_current = profile["current_formation_id"]
    current_id = None if raw_current is None else str(raw_current)

    formations = await home_queries.read_formations(tx, user_id, now_iso)
    slot_rows = await home_queries.read_today_slots(tx, user_id, bounds_start, bounds_end)
    next_slot_rows = await home_queries.read_next_slots(tx, user_id, now_iso)
    retention_rows = await home_queries.read_retention(tx, user_id)
    due = [] if current_id is None else await home_queries.read_due_notions(tx, user_id, current_id, now_iso)
    bricks = [] if current_id is None else await home_queries.read_bricks(tx, user_id, current_id)

    day_slots = [_day_slot(row) for row in slot_rows]
    highlight = home_derivations.highlighted_slot(day_slots, now)
    highlight_id = None if highlight is None else highlight.id
    home_slots = [
        _home_slot(row, day_slot, highlight_id, now, time_zone)
        for row, day_slot in zip(slot_rows, day_slots, strict=True)
    ]

    counted = [day_slot for day_slot in day_slots if day_slot.kind != "global_quiz"]
    planned_minutes = sum(_slot_minutes(day_slot) for day_slot in counted)
    done_minutes = sum(_slot_minutes(day_slot) for day_slot in counted if day_slot.status == "done")

    highlight_row = (
        None
        if highlight_id is None
        else next((row for row in slot_rows if str(row["id"]) == highlight_id), None)
    )
    primary_action = (
        None if highlight_row is None else home_derivations.primary_action_for(_action_slot(highlight_row))
    )

    next_by_formation: dict[str, Mapping[str, Any]] = {}
    for row in next_slot_rows:
        next_by_formation.setdefault(str(row["formation_id"]), row)

    ongoing_rows = sorted(
        (row for row in formations if str(row["status"]) in ACTIVE_STATUSES),
        key=lambda row: (
            _rank(row, current_id),
            -_opened_ms(row),
            -_instant_ms(row["created_at"]),
        ),
    )
    ongoing = [
        _ongoing_row(row, next_by_formation.get(str(row["id"])), now, time_zone, current_id, index == 0)
        for index, row in enumerate(ongoing_rows)
    ]

    completed_rows = sorted(
        (row for row in formations if str(row["status"]) == "completed"),
        key=lambda row: -_completed_ms(row),
    )
    completed = [
        _completed_row(row, _compute_retention(retention_rows, now, time_zone, str(row["id"])), time_zone)
        for row in completed_rows
    ]

    current_formation = next((row for row in formations if str(row["id"]) == current_id), None)
    quiz: dict[str, Any] | None = None
    if current_formation is not None and str(current_formation["status"]) in ("active", "paused"):
        quiz = await _today_quiz_card(tx, user_id, current_formation, today, time_zone)
        if quiz is None:
            quiz = _global_quiz(
                current_formation,
                due,
                bricks,
                profile,
                today,
                now,
                time_zone,
                await _quiz_cap_minutes(tx, user_id),
            )

    return {
        "today": {
            "date": today,
            "label": home_derivations.civil_day_label(today, time_zone),
            "plannedMinutes": js_round(planned_minutes),
            "doneMinutes": js_round(done_minutes),
            "slots": home_slots,
            "primaryAction": primary_action,
        },
        "retention": _compute_retention(retention_rows, now, time_zone),
        "globalQuiz": quiz,
        "formations": {"ongoing": ongoing, "completed": completed},
    }


def _rank(row: Mapping[str, Any], current_formation_id: str | None) -> int:
    """`rank`: the current formation, then active, paused, proposed and cadrage."""
    if str(row["id"]) == current_formation_id:
        return -1
    status = str(row["status"])
    if status == "active":
        return 0
    if status == "paused":
        return 1
    return 2 if status == "programme_proposed" else 3


def _opened_ms(row: Mapping[str, Any]) -> int:
    """Last opening instant in epoch milliseconds, `0` when the formation was never opened."""
    return 0 if row["last_opened_at"] is None else _instant_ms(row["last_opened_at"])


def _completed_ms(row: Mapping[str, Any]) -> int:
    """Completion instant in epoch milliseconds, `0` when the formation is not completed."""
    return 0 if row["completed_at"] is None else _instant_ms(row["completed_at"])


async def get_home(deps: Any, actor: Actor) -> dict[str, Any]:
    """`GET /api/v1/home` - one read of the learner's home screen (ET-1, ET-2)."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        return await read_home(tx, actor.user_id, now)
