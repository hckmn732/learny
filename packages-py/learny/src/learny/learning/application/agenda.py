"""Agenda read model (SPEC-704 ET-2, BR-AGE-01, BR-AGE-04, BR-AGE-06).

Port of `packages/services/src/agenda/get-agenda.ts`: one read-only call behind RLS, the local day
and minutes of every slot computed in the learner's zone, and no clock read (ADR-0047).
"""

from collections.abc import Mapping, Sequence
from typing import Any

from learny.identity.domain.actor import Actor
from learny.learning.application.ports import LearningDeps
from learny.learning.domain.params import ENGINE
from learny.learning.infrastructure import queries
from learny.shared import time as shared_time
from learny.shared.errors import AppError
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import learning as texts

MAX_RANGE_DAYS = 42


def slot_label(kind: str) -> str:
    """`agendaSlotLabelOf`: the French label of a slot kind, the kind itself when unknown."""
    return texts.AGENDA_SLOT_LABELS.get(kind, kind)


def slot_href(
    *, kind: str, formation_id: str, module_id: str | None, activity_id: str | None, date: str
) -> str:
    """ET-5 \u2014 target of the open action of a slot."""
    base = f"/formations/{formation_id}"
    if kind == "contributions":
        return base if module_id is None else f"{base}/modules/{module_id}"
    if kind == "course":
        return base if module_id is None else f"{base}/modules/{module_id}/cours"
    if kind == "exercise":
        if module_id is None:
            return f"{base}/programme"
        if activity_id is None:
            return f"{base}/modules/{module_id}"
        return f"{base}/modules/{module_id}/exercices/{activity_id}"
    if kind == "validation_quiz":
        return base if module_id is None else f"{base}/modules/{module_id}/quiz"
    if kind == "mock_exam":
        return f"{base}/examen-blanc"
    if kind in ("global_quiz", "revision", "sprint"):
        return f"{base}/quiz-global"
    if kind == "micro_session":
        return f"{base}/quiz-global?mode=micro"
    if kind == "warmup":
        return "/accueil#echauffement"
    if kind == "weekly_review":
        return "/accueil#bilan"
    if kind == "buffer":
        return f"/agenda?vue=jour&date={date}"
    return base


def agenda_totals(slots: Sequence[Mapping[str, Any]]) -> dict[str, int]:
    """EF-11 \u2014 planned and done minutes outside the margins, margin count."""
    planned_minutes = 0
    done_minutes = 0
    margins_remaining = 0
    for slot in slots:
        duration = max(
            0,
            js_round(
                (
                    shared_time.to_epoch_ms(shared_time.parse_iso(_instant(slot["endsAt"])))
                    - shared_time.to_epoch_ms(shared_time.parse_iso(_instant(slot["startsAt"])))
                )
                / 60_000
            ),
        )
        if slot["kind"] == "buffer":
            if slot["status"] == "planned":
                margins_remaining += 1
            continue
        planned_minutes += duration
        if slot["status"] == "done":
            done_minutes += duration
    return {
        "plannedMinutes": planned_minutes,
        "doneMinutes": done_minutes,
        "marginsRemaining": margins_remaining,
    }


def _instant(value: Any) -> str:
    """A database instant as a canonical ISO string."""
    return value if isinstance(value, str) else shared_time.to_iso(value)


def _local_minutes(instant_ms: int, time_zone: str) -> int:
    wall = shared_time.from_epoch_ms(shared_time.wall_ms_of(instant_ms, time_zone))
    return wall.hour * 60 + wall.minute


def _end_of_user_day(day: str, time_zone: str) -> int:
    """Last millisecond of the civil day in the zone (`endOfUserDay`)."""
    return shared_time.start_of_user_day(_add_day(day), time_zone) - 1


def _add_day(day: str) -> str:
    year, month, day_number = int(day[0:4]), int(day[5:7]), int(day[8:10])
    from datetime import date, timedelta

    following = date(year, month, day_number) + timedelta(days=1)
    return f"{following.year:04d}-{following.month:02d}-{following.day:02d}"


async def get_agenda(deps: LearningDeps, actor: Actor, params: Mapping[str, Any]) -> dict[str, Any]:
    """ET-2 \u2014 slots of a civil window (42 days at most), bounds, caption period and totals."""
    now = deps.clock.now()
    now_ms = shared_time.to_epoch_ms(now)
    formation_param = str(params["formation"])
    date_from = str(params["from"])
    date_to = str(params["to"])

    async with deps.db.user_tx(actor) as tx:
        profile = await queries.read_agenda_profile(tx, actor.user_id)
        if profile is None:
            raise AppError("NOT_FOUND", texts.AGENDA_PROFILE_NOT_FOUND)
        timezone = str(profile["timezone"])

        formations = await queries.read_agenda_formations(tx, actor.user_id)
        formation_filter: Mapping[str, Any] | None = None
        if formation_param == "all":
            visible: list[Mapping[str, Any]] = list(formations)
        else:
            formation_filter = next(
                (formation for formation in formations if formation["id"] == formation_param), None
            )
            if formation_filter is None:
                raise AppError("NOT_FOUND", texts.AGENDA_FORMATION_NOT_FOUND)
            visible = [formation_filter]
        visible_ids = {str(formation["id"]) for formation in visible}

        module_rows = await queries.read_agenda_modules(tx, actor.user_id, formation_param)
        blocked_cutoff = _shift_days(
            shared_time.user_local_day(now_ms, timezone),
            -int(ENGINE["planner"]["blockedDelayDays"]),
        )
        blocked_row = next(
            (
                module
                for module in module_rows
                if str(module["formation_id"]) in visible_ids
                and module["planned_end"] is not None
                and str(module["planned_end"]) <= blocked_cutoff
            ),
            None,
        )
        blocked_module = (
            None
            if blocked_row is None
            else {
                "formationId": blocked_row["formation_id"],
                "moduleId": blocked_row["id"],
                "moduleNumber": int(blocked_row["position"]),
                "title": blocked_row["title"],
                "reason": "delayed",
            }
        )

        starts = sorted(
            [str(formation["start_date"]) for formation in visible if formation["start_date"] is not None]
        )
        ends = sorted(
            [str(formation["end_date"]) for formation in visible if formation["end_date"] is not None]
        )
        bounds = None if not starts or not ends else {"start": starts[0], "end": ends[-1]}

        current = next(
            (formation for formation in formations if formation["id"] == profile["current_formation_id"]),
            None,
        )
        caption_period: dict[str, str] | None = None
        if formation_filter is not None:
            if formation_filter["start_date"] is not None and formation_filter["end_date"] is not None:
                caption_period = {
                    "start": str(formation_filter["start_date"]),
                    "end": str(formation_filter["end_date"]),
                }
        elif current is not None and current["start_date"] is not None and current["end_date"] is not None:
            caption_period = {"start": str(current["start_date"]), "end": str(current["end_date"])}
        else:
            caption_period = bounds

        rows = await queries.read_agenda_slots(
            tx,
            actor.user_id,
            shared_time.to_iso(shared_time.from_epoch_ms(shared_time.start_of_user_day(date_from, timezone))),
            shared_time.to_iso(shared_time.from_epoch_ms(_end_of_user_day(date_to, timezone))),
            formation_param,
        )

        slots: list[dict[str, Any]] = []
        for row in rows:
            starts_at = shared_time.to_epoch_ms(shared_time.parse_iso(_instant(row["starts_at"])))
            ends_at = shared_time.to_epoch_ms(shared_time.parse_iso(_instant(row["ends_at"])))
            date = shared_time.user_local_day(starts_at, timezone)
            if date < date_from or date > date_to:
                continue
            kind = str(row["kind"])
            meta = row["meta"]
            if bool(row["group_milestone"]) and (meta is None or meta == ""):
                meta = texts.AGENDA_GROUP_MILESTONE
            slots.append(
                {
                    "id": row["id"],
                    "formationId": row["formation_id"],
                    "moduleId": row["module_id"],
                    "moduleNumber": None if row["module_number"] is None else int(row["module_number"]),
                    "kind": kind,
                    "typeLabel": slot_label(kind),
                    "title": row["title"],
                    "meta": meta,
                    "date": date,
                    "startsAt": shared_time.to_iso(shared_time.from_epoch_ms(starts_at)),
                    "endsAt": shared_time.to_iso(shared_time.from_epoch_ms(ends_at)),
                    "startMinutes": _local_minutes(starts_at, timezone),
                    "endMinutes": _local_minutes(ends_at, timezone),
                    "status": row["status"],
                    "href": slot_href(
                        kind=kind,
                        formation_id=str(row["formation_id"]),
                        module_id=None if row["module_id"] is None else str(row["module_id"]),
                        activity_id=None if row["activity_id"] is None else str(row["activity_id"]),
                        date=date,
                    ),
                    "activityId": row["activity_id"],
                    "movable": row["status"] == "planned" and starts_at > now_ms,
                }
            )

        study_days = _study_days(profile["study_days"])
        return {
            "timezone": timezone,
            "today": shared_time.user_local_day(now_ms, timezone),
            "currentFormationId": profile["current_formation_id"],
            "bounds": bounds,
            "captionPeriod": caption_period,
            "studyDays": study_days,
            "formations": [
                {
                    "id": formation["id"],
                    "title": formation["title"],
                    "sigle": formation["monogram"],
                    "status": formation["status"],
                }
                for formation in visible
            ],
            "slots": slots,
            "totals": agenda_totals(slots),
            "blockedModule": blocked_module,
        }


def _study_days(value: Any) -> list[int]:
    raw = [1, 2, 3, 4, 5] if value is None else list(value)
    days = []
    for item in raw:
        try:
            number = int(item)
        except (TypeError, ValueError):
            continue
        if 1 <= number <= 7:
            days.append(number)
    return sorted(days)


def _shift_days(day: str, offset: int) -> str:
    from learny.learning.domain.time import add_days

    return add_days(day, offset)
