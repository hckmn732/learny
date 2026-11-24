"""Deterministic greedy planner of the learning engine (SPEC-407, ADR-0029, ADR-0280).

The time grid, the schedule, the compatible slots and the incremental replanning. Every date, time
zone and business parameter is an input; nothing here reads the clock, the configuration package,
the database or the network. Formations are visited by end date then identifier, their modules by
position, and every activity is placed in the first compatible free window while the cumulative
daily capacity of all formations is respected.
"""

import math
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from functools import cmp_to_key
from typing import Any, NamedTuple

from learny.learning.domain.errors import EngineError, invalid_input, invalid_param
from learny.learning.domain.time import (
    add_days,
    compare_dates,
    days_between,
    format_local_time,
    instant_at,
    is_iso_date,
    is_local_time,
    is_time_zone,
    iso_weekday,
    local_date_of,
    local_minutes_of,
    parse_instant,
    parse_local_time,
)
from learny.learning.domain.types import Availability, assert_availability
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import learning_engine as texts
from learny.shared.prng import fnv1a32, utf16_key

MINUTES_PER_DAY = 1440
"""Local minutes of one civil day; a study moment never goes past it."""

MOMENT_ORDER = ("matin", "apres_midi", "soir")
"""Canonical order of the study moments (ADR-0029)."""

MAX_HORIZON_DAYS = 366
"""Furthest civil day the planner looks at, in both the scheduling and the alternatives search."""

CANCELLED = "cancelled"
MOVED = "moved"
DONE = "done"
MISSED = "missed"
PLANNED = "planned"


class MinuteRange(NamedTuple):
    """A half-open interval of local minutes inside one civil day."""

    start: int
    end: int


@dataclass(frozen=True, slots=True)
class PlannerParams:
    """Business parameters of the planner, the mirror of `ENGINE['planner']` (ADR-0280)."""

    moments: Mapping[str, MinuteRange]
    revision_tail_minutes: int
    global_quiz_minutes: int
    sprint_minutes: int
    sprint_days_before_default: int
    allowed_sprint_days_before: tuple[int, ...]
    validation_quiz_minutes: int
    buffer_minutes: int
    contribution_share: float
    granularity_minutes: int
    mock_exam_questions: int
    mock_exam_minutes_per_question: int
    mock_exam_threshold: float
    blocked_delay_days: int
    blocked_module_extra_days: int
    max_hours_per_day: int
    maintenance_global_quiz_minutes: int


@dataclass(frozen=True, slots=True)
class PlannerPreferences:
    """Learner rhythm, time zone and non-study days."""

    tz: str
    availability: Availability
    holidays: tuple[str, ...] = ()

    def with_availability(self, availability: Availability) -> "PlannerPreferences":
        """Same preferences with another availability."""
        return PlannerPreferences(self.tz, availability, self.holidays)


@dataclass(frozen=True, slots=True)
class _Activity:
    """One activity to place, before it becomes a slot."""

    key: str
    formation_id: str
    module_id: str | None
    kind: str
    title: str
    minutes: int
    buffer_minutes: int


@dataclass(frozen=True, slots=True)
class _Placement:
    date: str
    moment: str
    start: int
    end: int


@dataclass(slots=True)
class _State:
    """Working agenda: busy ranges, used minutes and the daily global quiz per civil day."""

    busy: dict[str, list[MinuteRange]] = field(default_factory=dict)
    used: dict[str, int] = field(default_factory=dict)
    quiz_dates: set[str] = field(default_factory=set)
    slots: list[dict[str, Any]] = field(default_factory=list)
    consumed_keys: dict[str, int] = field(default_factory=dict)
    missed_keys: dict[str, int] = field(default_factory=dict)
    used_ids: set[str] = field(default_factory=set)
    manual_conflicts: list[dict[str, Any]] = field(default_factory=list)


_DATE_ORDER = cmp_to_key(compare_dates)


def _is_integer(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    return isinstance(value, float) and math.isfinite(value) and float(value).is_integer()


def _is_positive_integer(value: Any) -> bool:
    return _is_integer(value) and float(value) > 0


def _as_int(value: Any) -> int:
    return int(value)


def parse_moment(moment: Any) -> MinuteRange:
    """Local minutes of one study moment; `INVALID_PARAM` on `params.moments` (ET-5)."""
    if not isinstance(moment, Mapping):
        raise invalid_param("params.moments", "Invalid study moments.")
    start_raw, end_raw = moment.get("start"), moment.get("end")
    if not is_local_time(start_raw) or not is_local_time(end_raw):
        raise invalid_param("params.moments", "Invalid study moments.")
    start = parse_local_time(str(start_raw))
    end = parse_local_time(str(end_raw))
    if end <= start:
        raise invalid_param("params.moments", "The end of a study moment must follow its start.")
    return MinuteRange(start, end)


def assert_planner_params(value: Any) -> PlannerParams:
    """Validates the planner parameters at the engine boundary and reads them (ET-5)."""
    if isinstance(value, PlannerParams):
        return value
    if not isinstance(value, Mapping):
        raise invalid_param("params", "Planner parameters are required.")
    positive = (
        ("revisionTailMinutes", value.get("revisionTailMinutes")),
        ("globalQuizMinutes", value.get("globalQuizMinutes")),
        ("sprintMinutes", value.get("sprintMinutes")),
        ("validationQuizMinutes", value.get("validationQuizMinutes")),
        ("bufferMinutes", value.get("bufferMinutes")),
        ("granularityMinutes", value.get("granularityMinutes")),
        ("maxHoursPerDay", value.get("maxHoursPerDay")),
    )
    for key, raw in positive:
        if not _is_positive_integer(raw):
            raise invalid_param(f"params.{key}", f"{key} must be a positive integer.")
    share = value.get("contributionShare")
    if not isinstance(share, (int, float)) or isinstance(share, bool) or not 0 <= share <= 1:
        raise invalid_param("params.contributionShare", "contributionShare must be within 0..1.")
    sprint_days = value.get("sprintDaysBeforeDefault")
    allowed_days = value.get("allowedSprintDaysBefore")
    if not isinstance(allowed_days, (list, tuple)):
        raise invalid_param("params.allowedSprintDaysBefore", "allowedSprintDaysBefore must be an array.")
    if not _is_integer(sprint_days) or _as_int(sprint_days) < 1:
        raise invalid_param("params.sprintDaysBeforeDefault", "sprintDaysBeforeDefault must be at least 1.")
    if _as_int(sprint_days) not in [_as_int(day) for day in allowed_days]:
        raise invalid_param(
            "params.sprintDaysBeforeDefault",
            "sprintDaysBeforeDefault must appear in allowedSprintDaysBefore.",
        )
    exam = value.get("mockExam")
    if not isinstance(exam, Mapping):
        raise invalid_param("params.mockExam", "Mock-exam parameters are required.")
    questions, per_question = exam.get("questions"), exam.get("minutesPerQuestion")
    if (
        not _is_integer(questions)
        or not _is_integer(per_question)
        or _as_int(questions) < 1
        or _as_int(per_question) < 1
    ):
        raise invalid_param("params.mockExam", "Questions and minutes per question must be at least 1.")
    moments_raw = value.get("moments")
    if not isinstance(moments_raw, Mapping):
        raise invalid_param("params.moments", "Invalid study moments.")
    moments = {slot: parse_moment(moments_raw.get(slot)) for slot in MOMENT_ORDER}
    threshold = exam.get("threshold")
    return PlannerParams(
        moments=moments,
        revision_tail_minutes=_as_int(value["revisionTailMinutes"]),
        global_quiz_minutes=_as_int(value["globalQuizMinutes"]),
        sprint_minutes=_as_int(value["sprintMinutes"]),
        sprint_days_before_default=_as_int(sprint_days),
        allowed_sprint_days_before=tuple(_as_int(day) for day in allowed_days),
        validation_quiz_minutes=_as_int(value["validationQuizMinutes"]),
        buffer_minutes=_as_int(value["bufferMinutes"]),
        contribution_share=float(share),
        granularity_minutes=_as_int(value["granularityMinutes"]),
        mock_exam_questions=_as_int(questions),
        mock_exam_minutes_per_question=_as_int(per_question),
        mock_exam_threshold=float(threshold) if isinstance(threshold, (int, float)) else 0.0,
        blocked_delay_days=_as_int(value["blockedDelayDays"]),
        blocked_module_extra_days=_as_int(value["blockedModuleExtraDays"]),
        max_hours_per_day=_as_int(value["maxHoursPerDay"]),
        maintenance_global_quiz_minutes=_as_int(value["maintenanceGlobalQuizMinutes"]),
    )


def assert_preferences(value: Any) -> PlannerPreferences:
    """Validates the preferences at the engine boundary; an empty study-day list keeps CL-1."""
    if not isinstance(value, Mapping):
        raise invalid_input("preferences", "Planner preferences are required.")
    tz = value.get("tz")
    if not is_time_zone(tz):
        raise invalid_input("preferences.tz", f"Unknown time zone: {tz!s}")
    holidays_raw = value.get("holidays")
    holidays: tuple[str, ...] = ()
    if holidays_raw is not None:
        if not isinstance(holidays_raw, (list, tuple)):
            raise invalid_input("preferences.holidays", "Holidays must be an array.")
        for holiday in holidays_raw:
            if not is_iso_date(holiday):
                raise invalid_input("preferences.holidays", f"Invalid holiday: {holiday!s}")
        holidays = tuple(str(holiday) for holiday in holidays_raw)
    availability = assert_availability(value.get("availability"))
    return PlannerPreferences(tz=str(tz), availability=availability, holidays=holidays)


def round_to_granularity(minutes: float, granularity: int) -> int:
    """Rounds to the nearest granularity, never below one granularity (`Math.round`)."""
    return max(granularity, js_round(minutes / granularity) * granularity)


def max_chunk_minutes(params: PlannerParams, preferred_slots: Sequence[str]) -> int:
    """Largest contiguous block the planner creates: the longest preferred moment (ADR-0280)."""
    longest = params.granularity_minutes
    for slot in preferred_slots:
        window = params.moments[slot]
        longest = max(longest, window.end - window.start)
    return longest


def is_study_day(date: str, preferences: PlannerPreferences) -> bool:
    """True when the civil day is a declared study day and not a holiday."""
    if iso_weekday(date) not in preferences.availability.study_days:
        return False
    return date not in preferences.holidays


def windows_of_day(
    date: str,
    preferences: PlannerPreferences,
    params: PlannerParams,
    now_date: str,
    now_minutes: int,
) -> list[tuple[str, MinuteRange]]:
    """Preferred moments of one civil day, clipped to the current minute on the current day."""
    windows: list[tuple[str, MinuteRange]] = []
    for moment in preferences.availability.preferred_slots:
        window = params.moments[moment]
        start = max(window.start, now_minutes) if date == now_date else window.start
        windows.append((moment, MinuteRange(start, window.end)))
    return windows


def global_quiz_reserve(preferences: PlannerPreferences, params: PlannerParams) -> MinuteRange:
    """Last preferred moment: the daily global quiz is reserved at its end (BR-AGE-03)."""
    slots = preferences.availability.preferred_slots
    if not slots:
        raise EngineError(
            "INVALID_AVAILABILITY",
            "No preferred study moment.",
            "preferences.availability.preferredSlots",
        )
    window = params.moments[slots[-1]]
    start = max(window.start, window.end - params.global_quiz_minutes)
    return MinuteRange(start, window.end)


def subtract_ranges(range_: MinuteRange, blocks: Sequence[MinuteRange]) -> list[MinuteRange]:
    """Removes every block from a range, returning the remaining disjoint sub-ranges."""
    remaining: list[MinuteRange] = [range_]
    for block in blocks:
        next_parts: list[MinuteRange] = []
        for part in remaining:
            if block.end <= part.start or block.start >= part.end:
                next_parts.append(part)
                continue
            if block.start > part.start:
                next_parts.append(MinuteRange(part.start, block.start))
            if block.end < part.end:
                next_parts.append(MinuteRange(block.end, part.end))
        remaining = next_parts
    return remaining


def overlaps(one: MinuteRange, other: MinuteRange) -> bool:
    """Two half-open ranges share at least one minute."""
    return one.start < other.end and other.start < one.end


def minutes_of_range(range_: MinuteRange) -> int:
    """Length of a range in minutes, never negative."""
    return max(0, range_.end - range_.start)


def slot_local_intervals(starts_at: str, ends_at: str, tz: str) -> list[tuple[str, MinuteRange]]:
    """Splits a stored slot into local-minute intervals per civil day (it may cross midnight)."""
    start_ms = parse_instant(starts_at)
    end_ms = parse_instant(ends_at)
    if end_ms <= start_ms:
        raise invalid_input("slots.endsAt", "The end of a slot must follow its start.")
    start_date = local_date_of(starts_at, tz)
    end_date = local_date_of(ends_at, tz)
    start_minute = local_minutes_of(starts_at, tz)
    end_minute = local_minutes_of(ends_at, tz)
    if start_date == end_date:
        return [(start_date, MinuteRange(start_minute, end_minute))]
    parts: list[tuple[str, MinuteRange]] = []
    if start_minute < MINUTES_PER_DAY:
        parts.append((start_date, MinuteRange(start_minute, MINUTES_PER_DAY)))
    days = days_between(start_date, end_date)
    for offset in range(1, days):
        parts.append((add_days(start_date, offset), MinuteRange(0, MINUTES_PER_DAY)))
    if end_minute > 0:
        parts.append((end_date, MinuteRange(0, end_minute)))
    return parts


def is_real_window(date: str, range_: MinuteRange, tz: str) -> bool:
    """True when the local window is made only of real readings (no spring-forward gap, CL-2)."""
    if range_.end > MINUTES_PER_DAY or range_.start < 0:
        return False
    start_time = format_local_time(range_.start)
    end_time = "23:59" if range_.end == MINUTES_PER_DAY else format_local_time(range_.end)
    start_instant = instant_at(date, start_time, tz)
    end_instant = (
        instant_at(add_days(date, 1), "00:00", tz)
        if range_.end == MINUTES_PER_DAY
        else instant_at(date, end_time, tz)
    )
    if local_minutes_of(start_instant, tz) != range_.start:
        return False
    end_local = 0 if range_.end == MINUTES_PER_DAY else range_.end
    if local_minutes_of(end_instant, tz) != end_local:
        return False
    real_minutes = (parse_instant(end_instant) - parse_instant(start_instant)) / 60_000
    return real_minutes >= range_.end - range_.start


def instants_of_range(date: str, range_: MinuteRange, tz: str) -> tuple[str, str]:
    """The two UTC instants of a local window, the end of day being the next local midnight."""
    starts_at = instant_at(date, format_local_time(range_.start), tz)
    ends_at = (
        instant_at(add_days(date, 1), "00:00", tz)
        if range_.end == MINUTES_PER_DAY
        else instant_at(date, format_local_time(range_.end), tz)
    )
    return starts_at, ends_at


def _base36(value: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    out: list[str] = []
    while value:
        value, remainder = divmod(value, 36)
        out.append(digits[remainder])
    return "".join(reversed(out))


def compare_text(left: str, right: str) -> int:
    """`<` on two strings as JavaScript compares them (UTF-16 code units)."""
    left_key, right_key = utf16_key(left), utf16_key(right)
    if left_key == right_key:
        return 0
    return -1 if left_key < right_key else 1


def slot_identifier(key: str) -> str:
    """Stable slot identifier of an activity key (`slot-` plus FNV-1a in base 36)."""
    return f"slot-{_base36(fnv1a32(key))}"


def activity_key(formation_id: str, module_id: str | None, kind: str, title: str) -> str:
    """Identity of an activity inside the agenda."""
    return f"{formation_id}|{module_id or ''}|{kind}|{title}"


def _match_key(activity: _Activity) -> str:
    return activity_key(activity.formation_id, activity.module_id, activity.kind, activity.title)


def _text_of(container: Mapping[str, Any], key: str, fallback: str) -> str:
    value = container.get(key)
    return fallback if value is None else str(value)


def _sorted_formations(formations: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    return sorted(
        formations,
        key=lambda formation: (
            utf16_key(str(formation["endDate"])),
            utf16_key(str(formation["formationId"])),
        ),
    )


def _sorted_modules(modules: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    return sorted(
        modules,
        key=lambda module: (_as_int(module["position"]), utf16_key(str(module["moduleId"]))),
    )


def _sorted_chapters(chapters: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    return sorted(
        chapters,
        key=lambda chapter: (_as_int(chapter["position"]), utf16_key(str(chapter["chapterId"]))),
    )


@dataclass(frozen=True, slots=True)
class _PlanInput:
    """Validated input of one planning run."""

    formations: tuple[Mapping[str, Any], ...]
    preferences: PlannerPreferences
    params: PlannerParams
    now: str
    existing_slots: tuple[Mapping[str, Any], ...]


def _validate_input(payload: Mapping[str, Any]) -> _PlanInput:
    params = assert_planner_params(payload.get("params"))
    preferences = assert_preferences(payload.get("preferences"))
    assert_availability(payload["preferences"]["availability"])
    now = payload.get("now")
    if not isinstance(now, str):
        raise invalid_input("now", "The current instant is required.")
    parse_instant(now)
    formations_raw = payload.get("formations")
    if not isinstance(formations_raw, (list, tuple)):
        raise invalid_input("formations", "A list of formations is required.")
    for formation in formations_raw:
        if not isinstance(formation, Mapping):
            raise invalid_input("formations", "A formation object is required.")
        if not is_iso_date(formation.get("endDate")):
            raise invalid_input("formations.endDate", "Invalid end date.")
        modules = formation.get("modules")
        if not isinstance(modules, (list, tuple)):
            raise invalid_input("formations.modules", "A list of modules is required.")
        for module in modules:
            if not isinstance(module, Mapping):
                raise invalid_input("formations.modules", "A module object is required.")
            hours = module.get("hours")
            if (
                not isinstance(hours, (int, float))
                or isinstance(hours, bool)
                or not math.isfinite(float(hours))
                or hours <= 0
            ):
                raise invalid_input(
                    "formations.modules.hours",
                    f"Invalid hourly volume for {module.get('moduleId')!s}.",
                )
            if not _is_integer(module.get("position")) or _as_int(module["position"]) < 1:
                raise invalid_input(
                    "formations.modules.position",
                    f"Invalid module position for {module.get('moduleId')!s}.",
                )
            deadline = module.get("deadline")
            if deadline is not None and not is_iso_date(deadline):
                raise invalid_input("formations.modules.deadline", "Invalid module deadline.")
            chapters = module.get("chapters")
            if not isinstance(chapters, (list, tuple)):
                raise invalid_input("formations.modules.chapters", "A list of chapters is required.")
            for chapter in chapters:
                if not isinstance(chapter, Mapping):
                    raise invalid_input("formations.modules.chapters", "A chapter object is required.")
                if not _is_integer(chapter.get("position")) or _as_int(chapter["position"]) < 0:
                    raise invalid_input(
                        "formations.modules.chapters.position",
                        f"Invalid chapter position for {chapter.get('chapterId')!s}.",
                    )
    existing_raw = payload.get("existingSlots")
    existing: tuple[Mapping[str, Any], ...] = ()
    if existing_raw is not None:
        if not isinstance(existing_raw, (list, tuple)):
            raise invalid_input("existingSlots", "A list of slots is required.")
        for slot in existing_raw:
            if not isinstance(slot, Mapping):
                raise invalid_input("existingSlots", "A slot object is required.")
            try:
                slot_local_intervals(str(slot.get("startsAt")), str(slot.get("endsAt")), preferences.tz)
            except EngineError:
                raise
            except (KeyError, TypeError, ValueError) as error:
                raise invalid_input(
                    "existingSlots", f"Invalid existing slot: {slot.get('slotId')!s}"
                ) from error
        existing = tuple(existing_raw)
    return _PlanInput(
        formations=tuple(formations_raw),
        preferences=preferences,
        params=params,
        now=now,
        existing_slots=existing,
    )


def _day_capacity(preferences: PlannerPreferences) -> int:
    return preferences.availability.hours_per_day * 60


def _add_busy(state: _State, date: str, range_: MinuteRange) -> None:
    state.busy.setdefault(date, []).append(range_)


def _add_used(state: _State, date: str, minutes: int) -> None:
    state.used[date] = state.used.get(date, 0) + minutes


def _is_future(starts_at: str, now: str) -> bool:
    return parse_instant(starts_at) > parse_instant(now)


def _starts_on_or_after(starts_at: str, now: str) -> bool:
    return parse_instant(starts_at) >= parse_instant(now)


def _to_planned_slot(slot: Mapping[str, Any], status: str) -> dict[str, Any]:
    created_by = slot.get("createdBy")
    moved_from = slot.get("movedFromId")
    return {
        "slotId": slot["slotId"],
        "formationId": slot.get("formationId"),
        "moduleId": slot.get("moduleId"),
        "kind": slot["kind"],
        "title": slot["title"],
        "startsAt": slot["startsAt"],
        "endsAt": slot["endsAt"],
        "status": status,
        "createdBy": "planner" if created_by is None else created_by,
        "movedFromId": None if moved_from is None else moved_from,
    }


def _preserve_existing(
    payload: _PlanInput,
    is_paused: Callable[[str | None], bool],
    availability: Availability,
) -> _State:
    """Preserves completed, missed and valid manual slots before recomputing the future (ET-3)."""
    state = _State()
    preferences = payload.preferences.with_availability(availability)
    tz = preferences.tz
    capacity = _day_capacity(preferences)
    ordered = sorted(
        payload.existing_slots,
        key=lambda slot: (parse_instant(str(slot["startsAt"])), utf16_key(str(slot["slotId"]))),
    )
    for slot in ordered:
        future = _is_future(str(slot["startsAt"]), payload.now)
        # BR-FOR-15: a paused formation loses every future slot, but keeps its history.
        if is_paused(slot.get("formationId")) and future and slot["status"] != DONE:
            continue
        if slot["status"] == CANCELLED:
            state.slots.append(_to_planned_slot(slot, CANCELLED))
            state.used_ids.add(str(slot["slotId"]))
            continue
        intervals = slot_local_intervals(str(slot["startsAt"]), str(slot["endsAt"]), tz)
        if slot["status"] == MOVED:
            state.slots.append(_to_planned_slot(slot, MOVED))
            state.used_ids.add(str(slot["slotId"]))
            continue
        effective_status = (
            MISSED
            if slot["status"] == PLANNED
            and slot.get("createdBy") != "learner"
            and parse_instant(str(slot["endsAt"])) <= parse_instant(payload.now)
            else str(slot["status"])
        )
        if slot["status"] == PLANNED and slot.get("createdBy") == "learner" and future:
            invalid = False
            for date, range_ in intervals:
                already = state.busy.get(date, [])
                total = state.used.get(date, 0)
                if (
                    not is_study_day(date, preferences)
                    or any(overlaps(busy, range_) for busy in already)
                    or total + minutes_of_range(range_) > capacity
                ):
                    invalid = True
                    break
            if invalid:
                state.manual_conflicts.append(
                    {
                        "date": local_date_of(str(slot["startsAt"]), tz),
                        "kind": "overlap",
                        "slotIds": [slot["slotId"]],
                        "message": texts.PLANNER_REASON_MANUAL_MOVE,
                    }
                )
                continue
        state.slots.append(_to_planned_slot(slot, effective_status))
        state.used_ids.add(str(slot["slotId"]))
        if effective_status in (DONE, MISSED) or (
            effective_status == PLANNED and slot.get("createdBy") == "learner"
        ):
            key = activity_key(
                str(slot.get("formationId") or ""),
                None if slot.get("moduleId") is None else str(slot["moduleId"]),
                str(slot["kind"]),
                str(slot["title"]),
            )
            bucket = state.missed_keys if effective_status == MISSED else state.consumed_keys
            bucket[key] = bucket.get(key, 0) + 1
        for date, range_ in intervals:
            _add_busy(state, date, range_)
            _add_used(state, date, minutes_of_range(range_))
        if slot["kind"] == "global_quiz":
            state.quiz_dates.add(local_date_of(str(slot["startsAt"]), tz))
    return state


def _lightened_minutes(available: int, ratio: float, granularity: int) -> int:
    if ratio <= 0:
        return available
    return round_to_granularity(available * (1 - ratio), granularity)


def _distribute_contributions(
    total: int, chapters: Sequence[Mapping[str, Any]], granularity: int
) -> list[int]:
    count = max(1, len(chapters))
    base = math.floor(total / count / granularity) * granularity
    shares = [base] * count
    remaining = total - base * count
    index = 0
    while index < count and remaining >= granularity:
        shares[index] += granularity
        remaining -= granularity
        index += 1
    return shares


def _push_chunked(
    activities: list[_Activity],
    *,
    formation_id: str,
    module_id: str | None,
    kind: str,
    title: str,
    minutes: int,
    buffer_minutes: int,
    chunk_key: str,
    max_chunk: int,
) -> None:
    chunks = math.ceil(minutes / max_chunk) if max_chunk > 0 else 1
    if chunks <= 1:
        activities.append(
            _Activity(
                key=f"{chunk_key}|0",
                formation_id=formation_id,
                module_id=module_id,
                kind=kind,
                title=title,
                minutes=minutes,
                buffer_minutes=buffer_minutes,
            )
        )
        return
    remaining = minutes
    for index in range(chunks):
        part = min(max_chunk, remaining)
        activities.append(
            _Activity(
                key=f"{chunk_key}|{index}",
                formation_id=formation_id,
                module_id=module_id,
                kind=kind,
                title=f"{title} ({index + 1}/{chunks})",
                minutes=part,
                buffer_minutes=buffer_minutes if index == chunks - 1 else 0,
            )
        )
        remaining -= part


def _module_activities(
    formation: Mapping[str, Any],
    module: Mapping[str, Any],
    params: PlannerParams,
    lighten_ratio: float,
    max_chunk: int,
) -> list[_Activity]:
    activities: list[_Activity] = []
    granularity = params.granularity_minutes
    prefix = _text_of(module, "title", str(module["moduleId"]))
    total = round_to_granularity(float(module["hours"]) * 60, granularity)
    fixed = params.validation_quiz_minutes + params.buffer_minutes
    available = max(0, total - fixed)
    light = _lightened_minutes(available, lighten_ratio, granularity)
    contributions_total = min(light, round_to_granularity(light * params.contribution_share, granularity))
    rest = max(0, light - contributions_total)
    exercise = (
        round_to_granularity(rest * 0.3, granularity)
        if module.get("hasExercise") is True and rest >= granularity * 2
        else 0
    )
    course = max(0, rest - exercise)
    chapters = _sorted_chapters(module.get("chapters") or ())
    shares = _distribute_contributions(contributions_total, chapters, granularity)
    formation_id = str(formation["formationId"])
    module_id = str(module["moduleId"])
    if not chapters:
        if contributions_total > 0:
            _push_chunked(
                activities,
                formation_id=formation_id,
                module_id=module_id,
                kind="contributions",
                title=texts.PLANNER_SLOT_CONTRIBUTIONS.format(label=prefix),
                minutes=contributions_total,
                buffer_minutes=0,
                chunk_key=f"{formation_id}|{module_id}|contributions",
                max_chunk=max_chunk,
            )
    else:
        for index, chapter in enumerate(chapters):
            minutes = shares[index] if index < len(shares) else 0
            if minutes <= 0:
                continue
            label = _text_of(chapter, "title", str(chapter["chapterId"]))
            _push_chunked(
                activities,
                formation_id=formation_id,
                module_id=module_id,
                kind="contributions",
                title=texts.PLANNER_SLOT_CONTRIBUTIONS.format(label=label),
                minutes=minutes,
                buffer_minutes=0,
                chunk_key=f"{formation_id}|{module_id}|contributions|{chapter['chapterId']}",
                max_chunk=max_chunk,
            )
    if course > 0:
        _push_chunked(
            activities,
            formation_id=formation_id,
            module_id=module_id,
            kind="course",
            title=texts.PLANNER_SLOT_COURSE.format(label=prefix),
            minutes=course,
            buffer_minutes=0,
            chunk_key=f"{formation_id}|{module_id}|course",
            max_chunk=max_chunk,
        )
    if exercise > 0:
        _push_chunked(
            activities,
            formation_id=formation_id,
            module_id=module_id,
            kind="exercise",
            title=texts.PLANNER_SLOT_EXERCISE.format(label=prefix),
            minutes=exercise,
            buffer_minutes=0,
            chunk_key=f"{formation_id}|{module_id}|exercise",
            max_chunk=max_chunk,
        )
    _push_chunked(
        activities,
        formation_id=formation_id,
        module_id=module_id,
        kind="validation_quiz",
        title=texts.PLANNER_SLOT_VALIDATION_QUIZ.format(label=prefix),
        minutes=params.validation_quiz_minutes,
        buffer_minutes=params.buffer_minutes,
        chunk_key=f"{formation_id}|{module_id}|validation_quiz",
        max_chunk=max_chunk,
    )
    return activities


def _formation_activities(
    formation: Mapping[str, Any],
    params: PlannerParams,
    lighten_ratio: float,
    max_chunk: int,
) -> list[_Activity]:
    if formation.get("status") == "paused":
        return []
    activities: list[_Activity] = []
    modules = _sorted_modules(formation.get("modules") or ())
    objectives = formation.get("objectives") or ()
    exam = "exam" in objectives
    formation_id = str(formation["formationId"])
    title = _text_of(formation, "title", formation_id)
    for index, module in enumerate(modules):
        if module.get("status") != "validated":
            activities.extend(_module_activities(formation, module, params, lighten_ratio, max_chunk))
        penultimate = len(modules) >= 2 and index == len(modules) - 2
        last = index == len(modules) - 1
        if exam and (penultimate or last):
            number = 1 if penultimate else 2
            minutes = params.mock_exam_questions * params.mock_exam_minutes_per_question
            activities.append(
                _Activity(
                    key=f"{formation_id}||mock_exam|{number}",
                    formation_id=formation_id,
                    module_id=None,
                    kind="mock_exam",
                    title=texts.PLANNER_SLOT_MOCK_EXAM.format(number=number, title=title),
                    minutes=minutes,
                    buffer_minutes=0,
                )
            )
    return activities


def _content_minutes(formation: Mapping[str, Any], params: PlannerParams, lighten_ratio: float) -> int:
    activities = _formation_activities(
        formation, params, lighten_ratio, max_chunk_minutes(params, MOMENT_ORDER)
    )
    return sum(
        activity.minutes
        for activity in activities
        if activity.kind in ("contributions", "course", "exercise")
    )


def _find_placement(
    state: _State,
    payload: _PlanInput,
    availability: Availability,
    minutes: int,
    exact_date: str | None = None,
    not_before: str | None = None,
) -> _Placement | None:
    tz = payload.preferences.tz
    now_date = local_date_of(payload.now, tz)
    now_minutes = local_minutes_of(payload.now, tz)
    preferences = payload.preferences.with_availability(availability)
    capacity = _day_capacity(preferences)
    reserve = global_quiz_reserve(preferences, payload.params)
    start_date = now_date if exact_date is None else exact_date
    if exact_date is not None and compare_dates(exact_date, now_date) < 0:
        return None
    for offset in range(0, MAX_HORIZON_DAYS + 1):
        date = add_days(start_date, offset)
        if exact_date is not None and offset > 0:
            return None
        if not is_study_day(date, preferences):
            continue
        has_quiz = date in state.quiz_dates
        reserved = 0 if has_quiz else payload.params.global_quiz_minutes
        for moment, window in windows_of_day(date, preferences, payload.params, now_date, now_minutes):
            if window.end <= window.start:
                continue
            blocks = list(state.busy.get(date, []))
            if not has_quiz:
                blocks.append(reserve)
            if not_before is not None:
                not_before_date = local_date_of(not_before, tz)
                if compare_dates(not_before_date, date) > 0:
                    continue
                if not_before_date == date:
                    blocks.append(MinuteRange(0, local_minutes_of(not_before, tz)))
            for gap in subtract_ranges(window, blocks):
                if minutes_of_range(gap) < minutes:
                    continue
                candidate = MinuteRange(gap.start, gap.start + minutes)
                if candidate.end > MINUTES_PER_DAY:
                    continue
                if not is_real_window(date, candidate, tz):
                    continue
                if state.used.get(date, 0) + minutes + reserved > capacity:
                    continue
                return _Placement(date=date, moment=moment, start=candidate.start, end=candidate.end)
    return None


def _planned_ids(state: _State, activity: _Activity) -> tuple[str, str]:
    base = slot_identifier(activity.key)
    primary = base
    suffix = 1
    while primary in state.used_ids:
        suffix += 1
        primary = f"{base}-{suffix}"
    base = slot_identifier(f"{activity.key}|buffer")
    buffer = base
    suffix = 1
    while buffer in state.used_ids or buffer == primary:
        suffix += 1
        buffer = f"{base}-{suffix}"
    return primary, buffer


def _make_slot(
    state: _State,
    activity: _Activity,
    date: str,
    range_: MinuteRange,
    slot_id: str,
    tz: str,
) -> dict[str, Any]:
    starts_at, ends_at = instants_of_range(date, range_, tz)
    replay = state.missed_keys.get(_match_key(activity), 0)
    return {
        "slotId": f"{slot_id}-r{replay}" if replay > 0 else slot_id,
        "formationId": activity.formation_id,
        "moduleId": activity.module_id,
        "kind": activity.kind,
        "title": activity.title,
        "startsAt": starts_at,
        "endsAt": ends_at,
        "status": PLANNED,
        "createdBy": "planner",
        "movedFromId": None,
    }


def _record_slot(state: _State, slot: dict[str, Any], range_: MinuteRange, tz: str) -> None:
    state.slots.append(slot)
    state.used_ids.add(str(slot["slotId"]))
    date = local_date_of(str(slot["startsAt"]), tz)
    _add_busy(state, date, range_)
    _add_used(state, date, minutes_of_range(range_))


def _buffer_activity(activity: _Activity) -> _Activity:
    title = activity.title.removeprefix(texts.PLANNER_SLOT_VALIDATION_QUIZ_PREFIX)
    return _Activity(
        key=activity.key,
        formation_id=activity.formation_id,
        module_id=activity.module_id,
        kind="buffer",
        title=texts.PLANNER_SLOT_BUFFER.format(label=title),
        minutes=activity.buffer_minutes,
        buffer_minutes=0,
    )


def _schedule_activity(
    state: _State,
    payload: _PlanInput,
    availability: Availability,
    activity: _Activity,
    not_before: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None] | None:
    tz = payload.preferences.tz
    required = activity.minutes + activity.buffer_minutes
    placement = _find_placement(state, payload, availability, required, not_before=not_before)
    if placement is not None:
        primary_id, buffer_id = _planned_ids(state, activity)
        primary_range = MinuteRange(placement.start, placement.start + activity.minutes)
        primary = _make_slot(state, activity, placement.date, primary_range, primary_id, tz)
        _record_slot(state, primary, primary_range, tz)
        buffer: dict[str, Any] | None = None
        if activity.buffer_minutes > 0:
            buffer_range = MinuteRange(primary_range.end, primary_range.end + activity.buffer_minutes)
            buffer = _make_slot(
                state, _buffer_activity(activity), placement.date, buffer_range, buffer_id, tz
            )
            _record_slot(state, buffer, buffer_range, tz)
        return primary, buffer
    if activity.buffer_minutes == 0:
        return None
    # Low daily capacity: place the quiz alone, then its margin at the next compatible instant.
    alone = _find_placement(state, payload, availability, activity.minutes, not_before=not_before)
    if alone is None:
        return None
    primary_id, buffer_id = _planned_ids(state, activity)
    primary_range = MinuteRange(alone.start, alone.start + activity.minutes)
    primary = _make_slot(state, activity, alone.date, primary_range, primary_id, tz)
    _record_slot(state, primary, primary_range, tz)
    buffer_placement = _find_placement(
        state, payload, availability, activity.buffer_minutes, not_before=str(primary["endsAt"])
    )
    if buffer_placement is None:
        return primary, None
    buffer_range = MinuteRange(buffer_placement.start, buffer_placement.start + activity.buffer_minutes)
    buffer = _make_slot(
        state,
        _buffer_activity(activity),
        buffer_placement.date,
        buffer_range,
        buffer_id,
        tz,
    )
    _record_slot(state, buffer, buffer_range, tz)
    return primary, buffer


def _sprint_slot_id(exam_slot_id: str, date: str) -> str:
    return f"slot-sprint-{_base36(fnv1a32(f'{exam_slot_id}|{date}'))}"


def _schedule_sprints(state: _State, payload: _PlanInput, availability: Availability) -> None:
    tz = payload.preferences.tz
    now_date = local_date_of(payload.now, tz)
    default_offset = payload.params.sprint_days_before_default
    exams = [
        slot
        for slot in state.slots
        if slot["status"] == PLANNED
        and slot["kind"] in ("validation_quiz", "mock_exam")
        and _starts_on_or_after(str(slot["startsAt"]), payload.now)
    ]
    for exam in exams:
        exam_date = local_date_of(str(exam["startsAt"]), tz)
        targets: list[int] = []
        for offset in (default_offset, 1):
            if offset > 0 and offset not in targets:
                targets.append(offset)
        for offset in targets:
            target_date = add_days(exam_date, -offset)
            if compare_dates(target_date, now_date) < 0:
                continue
            study_date: str | None = None
            for back in range(0, 15):
                candidate = add_days(target_date, -back)
                if compare_dates(candidate, now_date) < 0:
                    break
                if is_study_day(candidate, payload.preferences):
                    study_date = candidate
                    break
            if study_date is None:
                continue
            sprint_id = _sprint_slot_id(str(exam["slotId"]), study_date)
            if sprint_id in state.used_ids:
                continue
            placement = _find_placement(
                state,
                payload,
                availability,
                payload.params.sprint_minutes,
                exact_date=study_date,
            )
            if placement is None:
                continue
            range_ = MinuteRange(placement.start, placement.start + payload.params.sprint_minutes)
            starts_at, ends_at = instants_of_range(study_date, range_, tz)
            state.slots.append(
                {
                    "slotId": sprint_id,
                    "formationId": exam["formationId"],
                    "moduleId": exam["moduleId"],
                    "kind": "sprint",
                    "title": texts.PLANNER_SLOT_SPRINT.format(title=exam["title"]),
                    "startsAt": starts_at,
                    "endsAt": ends_at,
                    "status": PLANNED,
                    "createdBy": "planner",
                    "movedFromId": None,
                }
            )
            state.used_ids.add(sprint_id)
            _add_busy(state, study_date, range_)
            _add_used(state, study_date, payload.params.sprint_minutes)


def _finalize_global_quizzes(state: _State, payload: _PlanInput) -> None:
    tz = payload.preferences.tz
    now_date = local_date_of(payload.now, tz)
    capacity = _day_capacity(payload.preferences)
    reserve = global_quiz_reserve(payload.preferences, payload.params)
    dates: set[str] = set()
    for slot in state.slots:
        if slot["kind"] == "global_quiz" or slot["status"] != PLANNED:
            continue
        if not _starts_on_or_after(str(slot["startsAt"]), payload.now):
            continue
        dates.add(local_date_of(str(slot["startsAt"]), tz))
    for date in sorted(dates, key=_DATE_ORDER):
        if compare_dates(date, now_date) < 0:
            continue
        if date in state.quiz_dates:
            continue
        if not is_real_window(date, reserve, tz):
            continue
        if state.used.get(date, 0) + minutes_of_range(reserve) > capacity:
            continue
        slot_id = f"slot-gq-{date}"
        if slot_id in state.used_ids:
            continue
        starts_at, ends_at = instants_of_range(date, reserve, tz)
        state.slots.append(
            {
                "slotId": slot_id,
                "formationId": None,
                "moduleId": None,
                "kind": "global_quiz",
                "title": texts.PLANNER_SLOT_GLOBAL_QUIZ,
                "startsAt": starts_at,
                "endsAt": ends_at,
                "status": PLANNED,
                "createdBy": "planner",
                "movedFromId": None,
            }
        )
        state.used_ids.add(slot_id)
        state.quiz_dates.add(date)
        _add_busy(state, date, reserve)
        _add_used(state, date, minutes_of_range(reserve))


def _compute_deadlines(payload: _PlanInput, slots: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    tz = payload.preferences.tz
    deadlines: list[dict[str, Any]] = []
    for formation in _sorted_formations(payload.formations):
        formation_id = str(formation["formationId"])
        end_date = str(formation["endDate"])
        planned = [
            slot
            for slot in slots
            if slot["formationId"] == formation_id
            and slot["status"] == PLANNED
            and slot["kind"] != "global_quiz"
        ]
        projected = end_date
        for slot in planned:
            date = local_date_of(str(slot["endsAt"]), tz)
            if compare_dates(date, projected) > 0:
                projected = date
        blocked: list[str] = []
        for module in _sorted_modules(formation.get("modules") or ()):
            if module.get("status") == "validated":
                continue
            module_id = str(module["moduleId"])
            module_slots = [slot for slot in planned if slot["moduleId"] == module_id]
            if not module_slots:
                continue
            module_end = end_date
            for slot in module_slots:
                date = local_date_of(str(slot["endsAt"]), tz)
                if compare_dates(date, module_end) > 0:
                    module_end = date
            reference = module.get("deadline")
            reference_date = end_date if reference is None else str(reference)
            if days_between(reference_date, module_end) >= payload.params.blocked_delay_days:
                blocked.append(module_id)
        deadlines.append(
            {
                "formationId": formation_id,
                "endDate": end_date,
                "projectedEndDate": projected,
                "missed": compare_dates(projected, end_date) > 0,
                "blockedModules": blocked,
            }
        )
    return deadlines


def _same_ids(left: Sequence[str], right: Sequence[str]) -> bool:
    return len(left) == len(right) and all(one == other for one, other in zip(left, right, strict=True))


def _compute_conflicts(
    payload: _PlanInput,
    slots: Sequence[dict[str, Any]],
    manual_conflicts: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    tz = payload.preferences.tz
    conflicts: list[dict[str, Any]] = list(manual_conflicts)
    by_date: dict[str, list[tuple[str, MinuteRange]]] = {}
    for slot in slots:
        if slot["status"] in (CANCELLED, MOVED):
            continue
        for date, range_ in slot_local_intervals(str(slot["startsAt"]), str(slot["endsAt"]), tz):
            by_date.setdefault(date, []).append((str(slot["slotId"]), range_))
    capacity = _day_capacity(payload.preferences)
    for date in sorted(by_date.keys(), key=_DATE_ORDER):
        entries = by_date[date]
        for left in range(0, len(entries)):
            for right in range(left + 1, len(entries)):
                one_id, one_range = entries[left]
                other_id, other_range = entries[right]
                if not overlaps(one_range, other_range):
                    continue
                ids = sorted([one_id, other_id], key=utf16_key)
                if any(
                    conflict["kind"] == "overlap" and _same_ids(conflict["slotIds"], ids)
                    for conflict in conflicts
                ):
                    continue
                conflicts.append(
                    {
                        "date": date,
                        "kind": "overlap",
                        "slotIds": ids,
                        "message": texts.PLANNER_CONFLICT_OVERLAP.format(date=date),
                    }
                )
        used = sum(minutes_of_range(range_) for _slot_id, range_ in entries)
        if used > capacity:
            conflicts.append(
                {
                    "date": date,
                    "kind": "capacity",
                    "slotIds": sorted([entry[0] for entry in entries], key=utf16_key),
                    "message": texts.PLANNER_CONFLICT_CAPACITY.format(
                        date=date, used=used, capacity=capacity
                    ),
                }
            )
    return conflicts


def _compute_remaining_capacity(payload: _PlanInput, slots: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    tz = payload.preferences.tz
    used: dict[str, int] = {}
    for slot in slots:
        if slot["status"] in (CANCELLED, MOVED):
            continue
        for date, range_ in slot_local_intervals(str(slot["startsAt"]), str(slot["endsAt"]), tz):
            used[date] = used.get(date, 0) + minutes_of_range(range_)
    total = _day_capacity(payload.preferences)
    return [
        {
            "date": date,
            "totalMinutes": total,
            "usedMinutes": used[date],
            "remainingMinutes": max(0, total - used[date]),
        }
        for date in sorted(used.keys(), key=_DATE_ORDER)
    ]


def _availability_with_hours(payload: _PlanInput, hours: int) -> Availability:
    current = payload.preferences.availability
    return Availability(
        hours_per_day=hours,
        study_days=current.study_days,
        preferred_slots=current.preferred_slots,
    )


def _compute_outcome(
    payload: _PlanInput,
    availability: Availability | None = None,
    lighten_ratio: float = 0.0,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    effective = payload.preferences.availability if availability is None else availability
    formations = _sorted_formations(payload.formations)
    paused = {
        str(formation["formationId"]) for formation in formations if formation.get("status") == "paused"
    }
    state = _preserve_existing(
        payload,
        lambda formation_id: False if formation_id is None else str(formation_id) in paused,
        effective,
    )
    max_chunk = max_chunk_minutes(payload.params, effective.preferred_slots)
    unscheduled: list[dict[str, Any]] = []
    for formation in formations:
        if formation.get("status") == "paused":
            continue
        cursor: str | None = None
        for activity in _formation_activities(formation, payload.params, lighten_ratio, max_chunk):
            key = _match_key(activity)
            consumed = state.consumed_keys.get(key, 0)
            if consumed > 0:
                state.consumed_keys[key] = consumed - 1
                continue
            placed = _schedule_activity(state, payload, effective, activity, cursor)
            if placed is not None:
                buffer = placed[1]
                cursor = str(buffer["endsAt"] if buffer is not None else placed[0]["endsAt"])
            else:
                unscheduled.append(
                    {
                        "formationId": activity.formation_id,
                        "moduleId": activity.module_id,
                        "kind": activity.kind,
                        "title": activity.title,
                        "minutes": activity.minutes,
                        "reason": texts.PLANNER_REASON_UNSCHEDULED,
                    }
                )
    _schedule_sprints(state, payload, effective)
    _finalize_global_quizzes(state, payload)
    deadlines = _compute_deadlines(payload, state.slots)
    conflicts = _compute_conflicts(payload, state.slots, state.manual_conflicts)
    return state.slots, unscheduled, deadlines, conflicts


def _option_base(
    formation_id: str, kind: str, deadline: Mapping[str, Any], hours_per_day: int
) -> dict[str, Any]:
    return {
        "formationId": formation_id,
        "kind": kind,
        "feasible": False,
        "reason": None,
        "currentEndDate": deadline["endDate"],
        "projectedEndDate": deadline["projectedEndDate"],
        "extraDays": None,
        "currentHoursPerDay": hours_per_day,
        "newHoursPerDay": None,
        "removedMinutes": None,
    }


def _build_options(payload: _PlanInput, deadlines: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    hours = payload.preferences.availability.hours_per_day
    for deadline in deadlines:
        if not deadline["missed"]:
            continue
        formation = next(
            (
                candidate
                for candidate in payload.formations
                if candidate["formationId"] == deadline["formationId"]
            ),
            None,
        )
        if formation is None:
            continue
        shift = _option_base(str(formation["formationId"]), "shift_end", deadline, hours)
        options.append(
            {
                **shift,
                "feasible": True,
                "extraDays": max(
                    0, days_between(str(deadline["endDate"]), str(deadline["projectedEndDate"]))
                ),
            }
        )
        max_hours = min(payload.params.max_hours_per_day, 6)
        volume: dict[str, Any] | None = None
        last_projected = str(deadline["projectedEndDate"])
        for candidate in range(hours + 1, max_hours + 1):
            simulated = next(
                (
                    entry
                    for entry in _compute_outcome(
                        payload, availability=_availability_with_hours(payload, candidate)
                    )[2]
                    if entry["formationId"] == formation["formationId"]
                ),
                None,
            )
            if simulated is None:
                continue
            last_projected = str(simulated["projectedEndDate"])
            if not simulated["missed"]:
                volume = {
                    **shift,
                    "kind": "increase_volume",
                    "feasible": True,
                    "newHoursPerDay": candidate,
                    "projectedEndDate": simulated["projectedEndDate"],
                }
                break
        options.append(
            volume
            if volume is not None
            else {
                **shift,
                "kind": "increase_volume",
                "feasible": False,
                "reason": texts.PLANNER_REASON_VOLUME.format(hours=max_hours),
                "projectedEndDate": last_projected,
            }
        )
        light: dict[str, Any] | None = None
        last_light = str(deadline["projectedEndDate"])
        last_removed = 0
        base_content = _content_minutes(formation, payload.params, 0)
        for step in range(1, 10):
            ratio = step / 10
            simulated = next(
                (
                    entry
                    for entry in _compute_outcome(payload, lighten_ratio=ratio)[2]
                    if entry["formationId"] == formation["formationId"]
                ),
                None,
            )
            if simulated is None:
                continue
            last_light = str(simulated["projectedEndDate"])
            last_removed = max(0, base_content - _content_minutes(formation, payload.params, ratio))
            if not simulated["missed"]:
                light = {
                    **shift,
                    "kind": "lighten",
                    "feasible": True,
                    "projectedEndDate": simulated["projectedEndDate"],
                    "removedMinutes": last_removed,
                }
                break
        options.append(
            light
            if light is not None
            else {
                **shift,
                "kind": "lighten",
                "feasible": False,
                "reason": texts.PLANNER_REASON_LIGHTEN,
                "projectedEndDate": last_light,
                "removedMinutes": last_removed,
            }
        )
    return options


def plan_schedule(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Plans every active formation and returns slots, conflicts, capacity and BR-FOR-14 options."""
    if not isinstance(payload, Mapping):
        raise invalid_input("", "A planning input object is required.")
    data = _validate_input(payload)
    slots, unscheduled, deadlines, conflicts = _compute_outcome(data)
    options = _build_options(data, deadlines)
    ordered = sorted(
        slots,
        key=lambda slot: (parse_instant(str(slot["startsAt"])), utf16_key(str(slot["slotId"]))),
    )
    return {
        "slots": ordered,
        "conflicts": conflicts,
        "remainingCapacity": _compute_remaining_capacity(data, ordered),
        "options": options,
        "deadlines": deadlines,
        "unscheduled": unscheduled,
    }


def replan_schedule(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Incremental replanning (ET-3, EF-4): the event is expressed through the data itself."""
    return plan_schedule(payload)


def find_compatible_slots(
    activity: Mapping[str, Any],
    calendar: Mapping[str, Any],
    preferences: Mapping[str, Any],
    count: int = 3,
) -> list[dict[str, Any]]:
    """At most `count` non-overlapping windows compatible with the agenda (ET-2, BR-AGE-05)."""
    if not isinstance(activity, Mapping) or not isinstance(calendar, Mapping):
        raise invalid_input("", "An activity and a calendar are required.")
    params = assert_planner_params(calendar.get("params"))
    parsed = assert_preferences(preferences)
    now = calendar.get("now")
    if not isinstance(now, str):
        raise invalid_input("now", "The current instant is required.")
    parse_instant(now)
    duration = activity.get("durationMinutes")
    if not _is_integer(duration) or _as_int(duration) <= 0:
        raise invalid_input("activity.durationMinutes", "The activity duration must be a positive integer.")
    if not _is_integer(count) or _as_int(count) < 1:
        raise invalid_input("count", "The requested number of slots must be an integer of at least 1.")
    wanted = _as_int(duration)
    wanted_count = _as_int(count)
    slots_raw = calendar.get("slots")
    if not isinstance(slots_raw, (list, tuple)):
        raise invalid_input("slots", "A list of slots is required.")
    tz = parsed.tz
    now_date = local_date_of(now, tz)
    now_minutes = local_minutes_of(now, tz)
    capacity = parsed.availability.hours_per_day * 60
    reserve = global_quiz_reserve(parsed, params)
    busy: dict[str, list[MinuteRange]] = {}
    used: dict[str, int] = {}
    quiz_dates: set[str] = set()
    for slot in slots_raw:
        if not isinstance(slot, Mapping):
            raise invalid_input("slots", "A slot object is required.")
        if slot.get("status") in (CANCELLED, MOVED):
            continue
        for date, range_ in slot_local_intervals(str(slot["startsAt"]), str(slot["endsAt"]), tz):
            busy.setdefault(date, []).append(range_)
            used[date] = used.get(date, 0) + minutes_of_range(range_)
        if slot.get("kind") == "global_quiz":
            quiz_dates.add(local_date_of(str(slot["startsAt"]), tz))
    results: list[dict[str, Any]] = []
    offset = 0
    while offset <= MAX_HORIZON_DAYS and len(results) < wanted_count:
        date = add_days(now_date, offset)
        offset += 1
        if not is_study_day(date, parsed):
            continue
        has_quiz = date in quiz_dates
        reserved = 0 if has_quiz else params.global_quiz_minutes
        for moment, window in windows_of_day(date, parsed, params, now_date, now_minutes):
            if window.end <= window.start:
                continue
            blocks = list(busy.get(date, []))
            if not has_quiz:
                blocks.append(reserve)
            used_today = used.get(date, 0)
            for gap in subtract_ranges(window, blocks):
                cursor = gap.start
                while (
                    cursor + wanted <= gap.end
                    and used_today + wanted + reserved <= capacity
                    and len(results) < wanted_count
                ):
                    candidate = MinuteRange(cursor, cursor + wanted)
                    if is_real_window(date, candidate, tz):
                        starts_at, ends_at = instants_of_range(date, candidate, tz)
                        results.append(
                            {
                                "date": date,
                                "moment": moment,
                                "startsAt": starts_at,
                                "endsAt": ends_at,
                            }
                        )
                        busy.setdefault(date, []).append(candidate)
                        used_today += wanted
                        used[date] = used_today
                        quiz_dates.add(date)
                        cursor = candidate.end
                    else:
                        cursor += 1
                if len(results) >= wanted_count:
                    break
            if len(results) >= wanted_count:
                break
    return results


__all__ = [
    "MAX_HORIZON_DAYS",
    "MINUTES_PER_DAY",
    "MOMENT_ORDER",
    "MinuteRange",
    "PlannerParams",
    "PlannerPreferences",
    "activity_key",
    "assert_planner_params",
    "assert_preferences",
    "compare_text",
    "find_compatible_slots",
    "global_quiz_reserve",
    "instants_of_range",
    "is_real_window",
    "is_study_day",
    "max_chunk_minutes",
    "minutes_of_range",
    "overlaps",
    "parse_moment",
    "plan_schedule",
    "replan_schedule",
    "round_to_granularity",
    "slot_identifier",
    "slot_local_intervals",
    "subtract_ranges",
    "windows_of_day",
]
