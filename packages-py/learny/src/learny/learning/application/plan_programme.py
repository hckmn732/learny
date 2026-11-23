"""Initial planning of a validated programme (SPEC-605 EF-4, ET-5, SPEC-407).

Port of `packages/jobs/src/functions/programme.ts`: the event `formation/programme-validated`
carries the formation identifier once; a replay finds the planner slots already written and writes
nothing. The planner of SPEC-407 is reused as it is (`plan_schedule`, `ENGINE['planner']`), so no
planning rule is duplicated here: this use case only reads the formation, its modules and its
chapters, builds the planner input and inserts the planned slots.

The three early returns of the source ("formation absente", "programme vide", "deja planifie") are
internal outcomes of the job, never shown to a learner: the Python backend keeps them in English
(ADR-2011) while the observable behaviour is unchanged.
"""

import math
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from sqlalchemy import text

from learny.learning.domain.params import ENGINE
from learny.learning.domain.planner import plan_schedule
from learny.shared.time import to_iso

PLAN_PROGRAMME_JOB = "plan-programme"
DEFAULT_HOURS_PER_DAY = 2
DEFAULT_STUDY_DAYS = (1, 2, 3, 4, 5)
DEFAULT_PREFERRED_SLOTS = ("soir",)
FALLBACK_HORIZON_DAYS = 42
"""`now + 42 days` when neither the formation nor its last module carries an end date."""

REASON_FORMATION_MISSING = "formation missing"
REASON_EMPTY_PROGRAMME = "empty programme"
REASON_ALREADY_PLANNED = "already planned"

SELECT_FORMATION = text(
    """
    select f.id::text as id,
           f.title,
           f.start_date::text as start_date,
           f.end_date::text as end_date,
           f.volume_hours,
           p.timezone,
           sp.hours_per_day,
           sp.study_days,
           sp.preferred_slots::text[] as preferred_slots
    from public.formations f
    join public.profiles p on p.id = f.owner_id
    left join public.study_preferences sp on sp.user_id = f.owner_id
    where f.id = cast(:formation_id as uuid)
      and f.owner_id = cast(:user_id as uuid)
    limit 1
    """
)
SELECT_MODULES = text(
    """
    select id::text as id, position, title, planned_end::text as planned_end
    from public.modules
    where formation_id = cast(:formation_id as uuid)
    order by position asc
    """
)
SELECT_CHAPTERS = text(
    """
    select c.id::text as id, c.module_id::text as module_id, c.position, c.title
    from public.chapters c
    join public.modules m on m.id = c.module_id
    where m.formation_id = cast(:formation_id as uuid)
    order by c.position asc
    """
)
COUNT_PLANNER_SLOTS = text(
    """
    select count(*)::int as count
    from public.schedule_slots
    where user_id = cast(:user_id as uuid)
      and formation_id = cast(:formation_id as uuid)
      and planner_key is not null
    """
)
INSERT_SLOT = text(
    """
    insert into public.schedule_slots (
      user_id, formation_id, module_id, kind, title, starts_at, ends_at, status,
      created_by, planner_key, created_at, updated_at
    )
    values (
      cast(:user_id as uuid),
      cast(:formation_id as uuid),
      cast(:module_id as uuid),
      cast(:kind as public.slot_kind),
      :title,
      cast(:starts_at as timestamptz),
      cast(:ends_at as timestamptz),
      'planned'::public.slot_status,
      'planner'::public.slot_creator,
      :planner_key,
      cast(:now as timestamptz),
      cast(:now as timestamptz)
    )
    on conflict do nothing
    """
)


class PlanProgrammeDeps(Protocol):
    """What the job needs; `learny.shared.deps.Deps` satisfies it."""

    @property
    def clock(self) -> Any: ...

    @property
    def db(self) -> Any: ...

    @property
    def logger(self) -> Any: ...


def module_hours(volume_hours: float | None, module_count: int) -> int:
    """`max(1, floor(volume / modules))` with `volume = max(modules, volume ?? modules * 2)`."""
    if module_count == 0:
        return 1
    volume = max(module_count, volume_hours if volume_hours is not None else module_count * 2)
    return max(1, math.floor(volume / module_count))


def planner_modules(
    modules: Sequence[Mapping[str, Any]],
    chapters: Sequence[Mapping[str, Any]],
    hours: int,
) -> list[dict[str, Any]]:
    """One planner module per stored module, in position order, with its chapters."""
    by_module: dict[str, list[dict[str, Any]]] = {}
    for chapter in chapters:
        planned: dict[str, Any] = {"chapterId": str(chapter["id"]), "position": int(chapter["position"])}
        # Hotfix QA (SPEC-704): the lesson slots are titled with the chapter, not its id.
        if chapter.get("title") is not None:
            planned["title"] = str(chapter["title"])
        by_module.setdefault(str(chapter["module_id"]), []).append(planned)
    planner: list[dict[str, Any]] = []
    for module in modules:
        entry: dict[str, Any] = {
            "moduleId": str(module["id"]),
            "position": int(module["position"]),
            "title": str(module["title"]),
            "hours": hours,
            "chapters": by_module.get(str(module["id"]), []),
            "hasExercise": True,
        }
        if module["planned_end"] is not None:
            entry["deadline"] = str(module["planned_end"])
        planner.append(entry)
    return planner


def end_date_of(
    formation: Mapping[str, Any],
    modules: Sequence[Mapping[str, Any]],
    now: datetime,
) -> str:
    """`end_date ?? last module planned_end ?? now + 42 days` (a civil date)."""
    if formation["end_date"] is not None:
        return str(formation["end_date"])
    if modules and modules[-1]["planned_end"] is not None:
        return str(modules[-1]["planned_end"])
    return (now.astimezone(UTC) + timedelta(days=FALLBACK_HORIZON_DAYS)).date().isoformat()


def _timezone_of(formation: Mapping[str, Any]) -> str:
    stored = formation["timezone"]
    return str(stored) if stored else "Europe/Paris"


def plan_input_of(
    formation: Mapping[str, Any],
    modules: Sequence[Mapping[str, Any]],
    chapters: Sequence[Mapping[str, Any]],
    now: datetime,
) -> dict[str, Any]:
    """The planner input of the first planning of one formation (same shape as `programme.ts`)."""
    hours = module_hours(
        None if formation["volume_hours"] is None else float(formation["volume_hours"]),
        len(modules),
    )
    study_days = (
        [int(day) for day in formation["study_days"]] if formation["study_days"] else list(DEFAULT_STUDY_DAYS)
    )
    preferred = (
        [str(slot) for slot in formation["preferred_slots"]]
        if formation["preferred_slots"]
        else list(DEFAULT_PREFERRED_SLOTS)
    )
    return {
        "formations": [
            {
                "formationId": str(formation["id"]),
                "title": str(formation["title"]),
                "endDate": end_date_of(formation, modules, now),
                "status": "active",
                "modules": planner_modules(modules, chapters, hours),
            }
        ],
        "preferences": {
            "tz": _timezone_of(formation),
            "availability": {
                "hoursPerDay": (
                    int(formation["hours_per_day"])
                    if formation["hours_per_day"] is not None
                    else DEFAULT_HOURS_PER_DAY
                ),
                "studyDays": study_days,
                "preferredSlots": preferred,
            },
        },
        "params": ENGINE["planner"],
        "now": to_iso(now),
    }


async def plan_programme(
    deps: PlanProgrammeDeps,
    user_id: str,
    formation_id: str,
) -> dict[str, Any]:
    """Plans one validated programme once; a replay finds the slots and writes nothing."""
    now = deps.clock.now()
    async with deps.db.service_tx() as tx:
        formations = (
            (await tx.conn.execute(SELECT_FORMATION, {"user_id": user_id, "formation_id": formation_id}))
            .mappings()
            .all()
        )
        if not formations:
            return {"planned": 0, "reason": REASON_FORMATION_MISSING}
        modules = (await tx.conn.execute(SELECT_MODULES, {"formation_id": formation_id})).mappings().all()
        if not modules:
            return {"planned": 0, "reason": REASON_EMPTY_PROGRAMME}
        chapters = (await tx.conn.execute(SELECT_CHAPTERS, {"formation_id": formation_id})).mappings().all()
        existing = (
            (await tx.conn.execute(COUNT_PLANNER_SLOTS, {"user_id": user_id, "formation_id": formation_id}))
            .mappings()
            .all()
        )
        if int(existing[0]["count"]) > 0:
            return {"planned": 0, "reason": REASON_ALREADY_PLANNED}

        plan = plan_schedule(plan_input_of(formations[0], modules, chapters, now))
        slots = [
            slot
            for slot in plan["slots"]
            if slot["formationId"] == formation_id and slot["status"] == "planned"
        ]
        for slot in slots:
            await tx.conn.execute(
                INSERT_SLOT,
                {
                    "user_id": user_id,
                    "formation_id": formation_id,
                    "module_id": slot["moduleId"],
                    "kind": slot["kind"],
                    "title": slot["title"],
                    "starts_at": slot["startsAt"],
                    "ends_at": slot["endsAt"],
                    "planner_key": slot["slotId"],
                    "now": to_iso(now),
                },
            )
    deps.logger.info(
        "initial programme planned",
        job=PLAN_PROGRAMME_JOB,
        status="planned",
        resultCount=len(slots),
        outcome="ok" if not plan["conflicts"] else "conflicts",
    )
    return {"planned": len(slots), "conflicts": len(plan["conflicts"])}


__all__ = [
    "DEFAULT_HOURS_PER_DAY",
    "FALLBACK_HORIZON_DAYS",
    "PLAN_PROGRAMME_JOB",
    "REASON_ALREADY_PLANNED",
    "REASON_EMPTY_PROGRAMME",
    "REASON_FORMATION_MISSING",
    "PlanProgrammeDeps",
    "end_date_of",
    "module_hours",
    "plan_input_of",
    "plan_programme",
    "planner_modules",
]
