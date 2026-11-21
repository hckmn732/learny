"""SQL of the learning context (SPEC-2202).

Every statement is copied from the TypeScript service it replaces (`agenda/get-agenda.ts`,
`gaps/list-gaps.ts`, ...): same tables, same columns, same `order by`, same `for update` and same
advisory locks. `${x}` placeholders become bound `:x` parameters and nothing here reads the clock.
"""

from collections.abc import Mapping
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx


def row_of(found: Any) -> dict[str, Any]:
    """A plain mapping: SQLAlchemy returns `RowMapping`, which cannot be indexed cheaply."""
    return dict(found)


# --------------------------------------------------------------------------------------------------
# agenda.get (packages/services/src/agenda/get-agenda.ts, SPEC-704 ET-2)
# --------------------------------------------------------------------------------------------------

READ_AGENDA_PROFILE = text(
    """
    select p.timezone,
           p.current_formation_id::text as current_formation_id,
           sp.study_days
      from public.profiles p
      left join public.study_preferences sp on sp.user_id = p.id
     where p.id = cast(:user_id as uuid)
    """
)

READ_AGENDA_FORMATIONS = text(
    """
    select f.id::text as id,
           f.title,
           f.monogram,
           f.status::text as status,
           f.start_date::text as start_date,
           f.end_date::text as end_date
      from public.formations f
     where (f.owner_id = cast(:user_id as uuid) or exists (
       select 1 from public.groups g
       join public.group_members gm on gm.group_id = g.id
       where g.formation_id = f.id
         and gm.user_id = cast(:user_id as uuid)
         and gm.member_status = 'active'
     ))
       and f.status::text in ('active', 'paused', 'completed')
     order by f.created_at asc, f.id asc
    """
)

READ_AGENDA_MODULES = text(
    """
    select m.id::text as id,
           m.formation_id::text as formation_id,
           m.position::int as position,
           m.title,
           m.planned_end::text as planned_end,
           m.status::text as status
      from public.modules m
      join public.formations f on f.id = m.formation_id
     where (f.owner_id = cast(:user_id as uuid) or exists (
       select 1 from public.groups g
       join public.group_members gm on gm.group_id = g.id
       where g.formation_id = f.id
         and gm.user_id = cast(:user_id as uuid)
         and gm.member_status = 'active'
     ))
       and f.status::text in ('active', 'paused')
       and m.status::text <> 'validated'
       and (:formation = 'all' or m.formation_id::text = :formation)
     order by m.position asc, m.id asc
    """
)

READ_AGENDA_SLOTS = text(
    """
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           m.position::int as module_number,
           ss.kind::text as kind,
           ss.title,
           ss.meta,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status,
           ss.activity_id::text as activity_id,
           ss.group_milestone
      from public.schedule_slots ss
      left join public.modules m on m.id = ss.module_id
     where ss.user_id = cast(:user_id as uuid)
       and ss.status in ('planned', 'done', 'missed')
       and ss.starts_at >= cast(:starts_after as timestamptz)
       and ss.starts_at <= cast(:starts_before as timestamptz)
     order by ss.starts_at asc, ss.id asc
    """
)

READ_AGENDA_SLOTS_OF_FORMATION = text(
    """
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           m.position::int as module_number,
           ss.kind::text as kind,
           ss.title,
           ss.meta,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status,
           ss.activity_id::text as activity_id,
           ss.group_milestone
      from public.schedule_slots ss
      left join public.modules m on m.id = ss.module_id
     where ss.user_id = cast(:user_id as uuid)
       and ss.status in ('planned', 'done', 'missed')
       and ss.starts_at >= cast(:starts_after as timestamptz)
       and ss.starts_at <= cast(:starts_before as timestamptz)
       and ss.formation_id = cast(:formation as uuid)
     order by ss.starts_at asc, ss.id asc
    """
)


async def read_agenda_profile(tx: Tx, user_id: str) -> Mapping[str, Any] | None:
    """The zone, the current formation and the study days of the learner."""
    result = await tx.conn.execute(READ_AGENDA_PROFILE, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_agenda_formations(tx: Tx, user_id: str) -> list[Mapping[str, Any]]:
    """The formations of the filter selector: active, paused or completed, oldest first."""
    result = await tx.conn.execute(READ_AGENDA_FORMATIONS, {"user_id": user_id})
    return [row_of(item) for item in result.mappings().all()]


async def read_agenda_modules(tx: Tx, user_id: str, formation: str) -> list[Mapping[str, Any]]:
    """Non-validated modules of the active and paused formations, by position."""
    result = await tx.conn.execute(READ_AGENDA_MODULES, {"user_id": user_id, "formation": formation})
    return [row_of(item) for item in result.mappings().all()]


async def read_agenda_slots(
    tx: Tx, user_id: str, starts_after: str, starts_before: str, formation: str
) -> list[Mapping[str, Any]]:
    """The planned, done and missed slots of the window, by start instant."""
    parameters = {
        "user_id": user_id,
        "starts_after": starts_after,
        "starts_before": starts_before,
        "formation": formation,
    }
    statement = READ_AGENDA_SLOTS if formation == "all" else READ_AGENDA_SLOTS_OF_FORMATION
    result = await tx.conn.execute(statement, parameters)
    return [row_of(item) for item in result.mappings().all()]


# --------------------------------------------------------------------------------------------------
# gaps.list (packages/services/src/gaps/list-gaps.ts, SPEC-615 EF-1)
# --------------------------------------------------------------------------------------------------

READ_GAPS_FORMATION = text(
    """
    select f.id::text as id,
           f.title,
           p.timezone
      from public.formations f
      join public.profiles p on p.id = cast(:user_id as uuid)
     where f.id = cast(:formation_id as uuid)
       and (
         f.owner_id = cast(:user_id as uuid)
         or exists (
           select 1
           from public.groups g
           join public.group_members gm on gm.group_id = g.id
           where g.formation_id = f.id
             and gm.user_id = cast(:user_id as uuid)
             and gm.member_status = 'active'
             and gm.left_at is null
         )
       )
    """
)

READ_GAPS_SUMMARY = text(
    """
    select count(*) filter (
             where ns.gap_nature is not null and ns.gap_cleared_at is null
           )::int as open_gaps,
           count(*) filter (where ns.mastery >= m.threshold)::int as mastered_notions,
           array_agg(distinct m.position order by m.position) filter (
             where ns.gap_nature is not null and ns.gap_cleared_at is null
           ) as gap_modules,
           array_agg(distinct m.position order by m.position) filter (
             where ns.mastery >= m.threshold
           ) as mastered_modules
      from public.notion_states ns
      join public.notions n on n.id = ns.notion_id
      join public.modules m on m.id = n.module_id
     where ns.user_id = cast(:user_id as uuid)
       and n.formation_id = cast(:formation_id as uuid)
    """
)

READ_GAPS_COUNTS = text(
    """
    select count(*) filter (where ns.gap_nature = 'forgetting')::int as forgetting,
           count(*) filter (where ns.gap_nature = 'confusion')::int as confusion,
           count(*) filter (where ns.gap_nature = 'misunderstanding')::int as misunderstanding,
           count(*) filter (where ns.gap_nature = 'application')::int as application
      from public.notion_states ns
      join public.notions n on n.id = ns.notion_id
     where ns.user_id = cast(:user_id as uuid)
       and n.formation_id = cast(:formation_id as uuid)
       and ns.gap_nature is not null
       and ns.gap_cleared_at is null
    """
)

READ_GAPS_ROWS = text(
    """
    select n.id::text as notion_id,
           n.label as notion_label,
           ns.gap_nature::text as nature,
           confused.label as confused_with_label,
           n.module_id::text as module_id,
           m.position::int as module_position,
           m.title as module_title,
           n.chapter_id::text as chapter_id,
           c.title as chapter_title,
           m.threshold::int as threshold,
           ns.mastery::float8 as mastery,
           ns.gap_detected_at as detected_at,
           coalesce(
             nullif(event.evidence->>'summary', ''),
             nullif(ns.gap_evidence, ''),
             ''
           ) as revealed_by,
           section.id::text as section_id,
           section.anchor as section_anchor
      from public.notion_states ns
      join public.notions n on n.id = ns.notion_id
      join public.modules m on m.id = n.module_id
      join public.chapters c on c.id = n.chapter_id
      left join public.notions confused on confused.id = ns.gap_confused_with
      left join lateral (
        select ge.evidence
        from public.gap_events ge
        where ge.user_id = ns.user_id
          and ge.notion_id = ns.notion_id
          and ge.kind in ('detected', 'nature_changed')
        order by ge.created_at desc, ge.id desc
        limit 1
      ) event on true
      left join lateral (
        select cs.id, cs.anchor
        from public.courses course
        join public.course_sections cs on cs.course_id = course.id
        where course.owner_id = cast(:user_id as uuid)
          and course.module_id = n.module_id
          and course.is_current
          and course.status = 'ready'
          and n.id = any(cs.notion_ids)
        order by cs.position
        limit 1
      ) section on true
     where ns.user_id = cast(:user_id as uuid)
       and n.formation_id = cast(:formation_id as uuid)
       and ns.gap_nature is not null
       and ns.gap_cleared_at is null
     order by case ns.gap_nature
                when 'confusion' then 0
                when 'misunderstanding' then 1
                when 'application' then 2
                else 3
              end,
              ns.gap_detected_at desc nulls last,
              n.label
    """
)

READ_GAPS_ROWS_OF_NATURE = text(
    """
    select n.id::text as notion_id,
           n.label as notion_label,
           ns.gap_nature::text as nature,
           confused.label as confused_with_label,
           n.module_id::text as module_id,
           m.position::int as module_position,
           m.title as module_title,
           n.chapter_id::text as chapter_id,
           c.title as chapter_title,
           m.threshold::int as threshold,
           ns.mastery::float8 as mastery,
           ns.gap_detected_at as detected_at,
           coalesce(
             nullif(event.evidence->>'summary', ''),
             nullif(ns.gap_evidence, ''),
             ''
           ) as revealed_by,
           section.id::text as section_id,
           section.anchor as section_anchor
      from public.notion_states ns
      join public.notions n on n.id = ns.notion_id
      join public.modules m on m.id = n.module_id
      join public.chapters c on c.id = n.chapter_id
      left join public.notions confused on confused.id = ns.gap_confused_with
      left join lateral (
        select ge.evidence
        from public.gap_events ge
        where ge.user_id = ns.user_id
          and ge.notion_id = ns.notion_id
          and ge.kind in ('detected', 'nature_changed')
        order by ge.created_at desc, ge.id desc
        limit 1
      ) event on true
      left join lateral (
        select cs.id, cs.anchor
        from public.courses course
        join public.course_sections cs on cs.course_id = course.id
        where course.owner_id = cast(:user_id as uuid)
          and course.module_id = n.module_id
          and course.is_current
          and course.status = 'ready'
          and n.id = any(cs.notion_ids)
        order by cs.position
        limit 1
      ) section on true
     where ns.user_id = cast(:user_id as uuid)
       and n.formation_id = cast(:formation_id as uuid)
       and ns.gap_nature is not null
       and ns.gap_cleared_at is null
       and ns.gap_nature = cast(:nature as public.gap_nature)
     order by case ns.gap_nature
                when 'confusion' then 0
                when 'misunderstanding' then 1
                when 'application' then 2
                else 3
              end,
              ns.gap_detected_at desc nulls last,
              n.label
    """
)

READ_GAPS_NEXT_REVIEW = text(
    """
    select min(ns.due_at) as next_review_at
      from public.notion_states ns
      join public.notions n on n.id = ns.notion_id
     where ns.user_id = cast(:user_id as uuid)
       and n.formation_id = cast(:formation_id as uuid)
       and ns.in_review
       and ns.due_at is not null
       and ns.due_at >= cast(:now as timestamptz)
    """
)


async def read_gaps_formation(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """CL-1 - the owner or an active member reads the formation, nobody else."""
    result = await tx.conn.execute(READ_GAPS_FORMATION, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_gaps_summary(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any]:
    """Open gaps, mastered notions and the module positions of both sets."""
    result = await tx.conn.execute(READ_GAPS_SUMMARY, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().all()
    if not found:
        return {
            "open_gaps": 0,
            "mastered_notions": 0,
            "gap_modules": None,
            "mastered_modules": None,
        }
    return row_of(found[0])


async def read_gaps_counts(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any]:
    """The four independent counters of the open gaps."""
    result = await tx.conn.execute(READ_GAPS_COUNTS, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().all()
    return {} if not found else row_of(found[0])


async def read_gaps_rows(
    tx: Tx, user_id: str, formation_id: str, nature: str | None
) -> list[Mapping[str, Any]]:
    """The open gap cards, filtered by nature when one is asked."""
    parameters: dict[str, Any] = {"user_id": user_id, "formation_id": formation_id}
    statement = READ_GAPS_ROWS
    if nature is not None:
        statement = READ_GAPS_ROWS_OF_NATURE
        parameters["nature"] = nature
    result = await tx.conn.execute(statement, parameters)
    return [row_of(item) for item in result.mappings().all()]


async def read_gaps_next_review(tx: Tx, user_id: str, formation_id: str, now: str) -> str | None:
    """The earliest scheduled review instant of the formation, if any."""
    result = await tx.conn.execute(
        READ_GAPS_NEXT_REVIEW, {"user_id": user_id, "formation_id": formation_id, "now": now}
    )
    found = result.mappings().all()
    value = None if not found else found[0]["next_review_at"]
    return None if value is None else _instant(value)


def _instant(value: Any) -> str:
    from learny.shared.time import to_iso

    return value if isinstance(value, str) else to_iso(value)


# --------------------------------------------------------------------------------------------------
# series.streak, series.milestones (packages/services/src/serie-regularite-et-jalons-interface.ts,
# SPEC-723)
# --------------------------------------------------------------------------------------------------

READ_SERIES_PROFILE = text(
    """
    select timezone, current_formation_id::text as current_formation_id
    from public.profiles
    where id = cast(:user_id as uuid)
    """
)

READ_SERIES_PREFERENCES = text(
    """
    select study_days from public.study_preferences where user_id = cast(:user_id as uuid)
    """
)

READ_SERIES_PAUSES = text(
    """
    select starts_on::text as starts_on, ends_on::text as ends_on
    from public.pauses
    where user_id = cast(:user_id as uuid)
    order by starts_on asc, ends_on asc
    """
)

READ_SERIES_ACTIVITIES = text(
    """
    select day::text as day, minutes::int as minutes, qualifying
    from public.daily_activity
    where user_id = cast(:user_id as uuid)
      and day between cast(:lookback_start as date) and cast(:today as date)
    order by day asc
    """
)

READ_SERIES_VALIDATED_MODULES = text(
    """
    select m.id::text as id, m.formation_id::text as formation_id, m.title
    from public.module_progress mp
    join public.modules m on m.id = mp.module_id
    where mp.user_id = cast(:user_id as uuid) and mp.status = 'validated'
    order by m.formation_id asc, m.position asc, m.id asc
    """
)

READ_SERIES_MASTERED_NOTIONS = text(
    """
    select count(*)::int as count
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    where ns.user_id = cast(:user_id as uuid)
      and ns.mastery >= :mastery_threshold
    """
)

READ_SERIES_OPEN_MODULE = text(
    """
    select m.id::text as id, m.title
    from public.modules m
    left join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
    where m.formation_id = cast(:formation_id as uuid)
      and coalesce(mp.status, m.status) = 'open'
    order by m.position asc, m.id asc
    limit 1
    """
)

READ_SERIES_MILESTONES = text(
    """
    select id::text as id,
           key::text as key,
           ref_id::text as ref_id,
           formation_id::text as formation_id,
           achieved_at
    from public.milestones
    where user_id = cast(:user_id as uuid)
    order by achieved_at desc, id asc
    """
)

INSERT_SERIES_MILESTONE = text(
    """
    insert into public.milestones (user_id, formation_id, key, ref_id, achieved_at)
    values (
      cast(:user_id as uuid),
      cast(:formation_id as uuid),
      cast(:kind as public.milestone_key),
      cast(:module_id as uuid),
      cast(:now as timestamptz)
    )
    on conflict (user_id, key, ref_id) do nothing
    returning id::text as id,
              key::text as key,
              ref_id::text as ref_id,
              formation_id::text as formation_id,
              achieved_at
    """
)

READ_SERIES_FORMATION_ACCESS = text(
    """
    select f.id::text as id
    from public.formations f
    where f.id = cast(:formation_id as uuid)
      and (
        f.owner_id = cast(:user_id as uuid)
        or exists (
          select 1
          from public.groups g
          join public.group_members gm on gm.group_id = g.id
          where g.formation_id = f.id
            and gm.user_id = cast(:user_id as uuid)
            and gm.member_status = 'active'
            and gm.left_at is null
        )
      )
    limit 1
    """
)

READ_SERIES_MILESTONE_ITEMS = text(
    """
    select ms.id::text as id,
           ms.key::text as key,
           ms.ref_id::text as ref_id,
           ms.formation_id::text as formation_id,
           f.title as formation_title,
           m.title as module_title,
           ms.achieved_at
    from public.milestones ms
    left join public.formations f on f.id = ms.formation_id
    left join public.modules m on m.id = ms.ref_id
    where ms.user_id = cast(:user_id as uuid)
    order by ms.achieved_at desc, ms.id asc
    """
)

READ_SERIES_MILESTONE_ITEMS_OF_FORMATION = text(
    """
    select ms.id::text as id,
           ms.key::text as key,
           ms.ref_id::text as ref_id,
           ms.formation_id::text as formation_id,
           f.title as formation_title,
           m.title as module_title,
           ms.achieved_at
    from public.milestones ms
    left join public.formations f on f.id = ms.formation_id
    left join public.modules m on m.id = ms.ref_id
    where ms.user_id = cast(:user_id as uuid)
      and (ms.formation_id = cast(:formation_id as uuid) or ms.key in ('notions_100', 'streak_30'))
    order by ms.achieved_at desc, ms.id asc
    """
)


async def read_series_profile(tx: Tx, user_id: str) -> Mapping[str, Any] | None:
    """The zone and the current formation of the learner."""
    result = await tx.conn.execute(READ_SERIES_PROFILE, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_series_preferences(tx: Tx, user_id: str) -> Mapping[str, Any] | None:
    """The study days of the learner, if their preferences row exists."""
    result = await tx.conn.execute(READ_SERIES_PREFERENCES, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_series_pauses(tx: Tx, user_id: str) -> list[Mapping[str, Any]]:
    """Every pause of the learner, oldest first."""
    result = await tx.conn.execute(READ_SERIES_PAUSES, {"user_id": user_id})
    return [row_of(item) for item in result.mappings().all()]


async def read_series_activities(
    tx: Tx, user_id: str, lookback_start: str, today: str
) -> list[Mapping[str, Any]]:
    """The persisted daily activity of the lookback window, oldest first."""
    result = await tx.conn.execute(
        READ_SERIES_ACTIVITIES,
        {"user_id": user_id, "lookback_start": lookback_start, "today": today},
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_series_validated_modules(tx: Tx, user_id: str) -> list[Mapping[str, Any]]:
    """The validated modules of the learner, by formation then position."""
    result = await tx.conn.execute(READ_SERIES_VALIDATED_MODULES, {"user_id": user_id})
    return [row_of(item) for item in result.mappings().all()]


async def read_series_mastered_notions(tx: Tx, user_id: str, mastery_threshold: int) -> Mapping[str, Any]:
    """The number of notions at or above the milestone mastery threshold."""
    result = await tx.conn.execute(
        READ_SERIES_MASTERED_NOTIONS,
        {"user_id": user_id, "mastery_threshold": mastery_threshold},
    )
    found = result.mappings().all()
    return {} if not found else row_of(found[0])


async def read_series_open_module(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """The first open module of the current formation, if any."""
    result = await tx.conn.execute(
        READ_SERIES_OPEN_MODULE, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_series_milestones(tx: Tx, user_id: str) -> list[Mapping[str, Any]]:
    """Every stored milestone of the learner, newest first."""
    result = await tx.conn.execute(READ_SERIES_MILESTONES, {"user_id": user_id})
    return [row_of(item) for item in result.mappings().all()]


async def insert_series_milestone(
    tx: Tx,
    user_id: str,
    formation_id: str | None,
    kind: str,
    module_id: str | None,
    now: str,
) -> Mapping[str, Any] | None:
    """Stores one milestone; a duplicate `(user, key, ref)` inserts nothing."""
    result = await tx.conn.execute(
        INSERT_SERIES_MILESTONE,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "kind": kind,
            "module_id": module_id,
            "now": now,
        },
    )
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_series_formation_access(tx: Tx, user_id: str, formation_id: str) -> bool:
    """The owner or an active member reads the formation filter, nobody else."""
    result = await tx.conn.execute(
        READ_SERIES_FORMATION_ACCESS, {"user_id": user_id, "formation_id": formation_id}
    )
    return bool(result.mappings().all())


async def read_series_milestone_items(
    tx: Tx, user_id: str, formation_id: str | None
) -> list[Mapping[str, Any]]:
    """The milestone cards, optionally restricted to one formation plus the global thresholds."""
    parameters: dict[str, Any] = {"user_id": user_id}
    statement = READ_SERIES_MILESTONE_ITEMS
    if formation_id is not None:
        statement = READ_SERIES_MILESTONE_ITEMS_OF_FORMATION
        parameters["formation_id"] = formation_id
    result = await tx.conn.execute(statement, parameters)
    return [row_of(item) for item in result.mappings().all()]


# --------------------------------------------------------------------------------------------------
# formations.finalReview, formations.maintenance
# (packages/services/src/formations/{get-final-review,set-maintenance}.ts, SPEC-617)
# --------------------------------------------------------------------------------------------------

READ_FINAL_REVIEW_FORMATION = text(
    """
    select f.id::text as id,
           f.owner_id::text as owner_id,
           f.title,
           f.monogram,
           f.accent_color::text as accent,
           f.status::text as status,
           f.default_threshold::int as default_threshold,
           f.start_date::text as start_date,
           f.completed_at,
           f.maintenance_mode::text as maintenance_mode,
           f.updated_at
    from public.formations f
    where f.id = cast(:formation_id as uuid)
      and (
        f.owner_id = cast(:user_id as uuid)
        or exists (
          select 1
          from public.groups g
          join public.group_members gm on gm.group_id = g.id
          where g.formation_id = f.id
            and gm.user_id = cast(:user_id as uuid)
            and gm.member_status = 'active'
            and gm.left_at is null
        )
      )
    limit 1
    """
)

READ_FINAL_REVIEW_MODULES = text(
    """
    select m.id::text as id,
           m.position::int as position,
           m.title,
           m.threshold::int as threshold,
           coalesce(mp.status, m.status)::text as status,
           mp.validated_at,
           mp.best_score::float8 as best_score
    from public.modules m
    left join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
    where m.formation_id = cast(:formation_id as uuid)
    order by m.position asc, m.id asc
    """
)

READ_FINAL_REVIEW_NOTIONS = text(
    """
    select n.id::text as id,
           n.label,
           n.module_id::text as module_id,
           m.position::int as module_position,
           m.title as module_title,
           coalesce(ns.mastery, 0)::float8 as mastery,
           ns.gap_nature::text as gap_nature,
           ns.gap_evidence,
           conf.label as confused_with_label
    from public.notions n
    join public.modules m on m.id = n.module_id
    left join public.notion_states ns
      on ns.notion_id = n.id and ns.user_id = cast(:user_id as uuid)
    left join public.notions conf on conf.id = ns.gap_confused_with
    where n.formation_id = cast(:formation_id as uuid)
    order by m.position asc, n.position asc, n.id asc
    """
)

READ_FINAL_REVIEW_SLOTS = text(
    """
    select s.id::text as id,
           s.kind::text as kind,
           s.status::text as status,
           s.starts_at,
           s.ends_at,
           s.moved_from_id::text as moved_from_id
    from public.schedule_slots s
    where s.user_id = cast(:user_id as uuid)
      and s.formation_id = cast(:formation_id as uuid)
      and s.status in ('done', 'planned', 'missed', 'moved', 'cancelled')
    order by s.starts_at asc, s.id asc
    """
)

READ_FINAL_REVIEW_MILESTONES = text(
    """
    select ms.id::text as id,
           ms.key::text as key,
           ms.ref_id::text as ref_id,
           ms.formation_id::text as formation_id,
           f.title as formation_title,
           m.title as module_title,
           ms.achieved_at
    from public.milestones ms
    left join public.formations f on f.id = ms.formation_id
    left join public.modules m on m.id = ms.ref_id
    where ms.user_id = cast(:user_id as uuid)
      and (
        ms.formation_id = cast(:formation_id as uuid)
        or ms.key in ('notions_100', 'streak_30')
      )
    order by ms.achieved_at desc, ms.id asc
    """
)

READ_FINAL_REVIEW_RETENTION_MODULES = text(
    """
    select m.id::text as module_id,
           mp.validated_at,
           coalesce(array_agg(n.id::text) filter (where n.id is not null), '{}') as notion_ids
    from public.modules m
    join public.module_progress mp on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
    left join public.notions n on n.module_id = m.id
    where m.formation_id = cast(:formation_id as uuid)
      and mp.status = 'validated'
      and mp.validated_at is not null
    group by m.id, mp.validated_at
    order by m.position asc, m.id asc
    """
)

READ_FINAL_REVIEW_REVIEWS = text(
    """
    select rl.id::text as review_id,
           rl.notion_id::text as notion_id,
           rl.reviewed_at,
           coalesce(rl.correct, false) as correct
    from public.review_logs rl
    join public.notions n on n.id = rl.notion_id
    where rl.user_id = cast(:user_id as uuid)
      and n.formation_id = cast(:formation_id as uuid)
    """
)

READ_FINAL_REVIEW_DUE_COUNT = text(
    """
    select count(*)::int as due_count
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    where ns.user_id = cast(:user_id as uuid)
      and n.formation_id = cast(:formation_id as uuid)
      and ns.in_review
      and not ns.suspended
      and ns.due_at <= cast(:now as timestamptz)
    """
)

READ_FINAL_REVIEW_PROGRAM_VERSION = text(
    """
    select max(version)::int as version
    from public.programme_proposals
    where formation_id = cast(:formation_id as uuid)
      and user_id = cast(:user_id as uuid)
    """
)

READ_FINAL_REVIEW_TIMEZONE = text(
    """
    select timezone from public.profiles where id = cast(:user_id as uuid)
    """
)

READ_MAINTENANCE_FORMATION = text(
    """
    select f.id::text as id,
           f.owner_id::text as owner_id,
           f.title,
           f.monogram,
           f.accent_color::text as accent,
           f.status::text as status,
           f.default_threshold::int as default_threshold,
           f.start_date::text as start_date,
           f.completed_at,
           f.maintenance_mode::text as maintenance_mode,
           f.updated_at,
           (
             select count(*)::int
             from public.modules m
             where m.formation_id = f.id
           ) as module_count,
           (
             select count(*)::int
             from public.modules m
             left join public.module_progress mp
               on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
             where m.formation_id = f.id
               and coalesce(mp.status, m.status) = 'validated'
           ) as validated_count
    from public.formations f
    where f.id = cast(:formation_id as uuid)
      and f.owner_id = cast(:user_id as uuid)
    for update
    """
)

LOCK_MAINTENANCE_EXCLUSIVE = text("select pg_advisory_xact_lock(hashtextextended(:key, 0))")

UPDATE_MAINTENANCE_MODE = text(
    """
    update public.formations
    set maintenance_mode = cast(:mode as public.maintenance_mode),
        updated_at = cast(:now as timestamptz)
    where id = cast(:formation_id as uuid)
      and owner_id = cast(:user_id as uuid)
    """
)

CANCEL_FUTURE_SLOTS = text(
    """
    update public.schedule_slots
    set status = 'cancelled',
        updated_at = cast(:now as timestamptz)
    where user_id = cast(:user_id as uuid)
      and formation_id = cast(:formation_id as uuid)
      and status = 'planned'
      and starts_at >= cast(:now as timestamptz)
    """
)

SKIP_SCHEDULED_REMINDERS = text(
    """
    update public.notification_deliveries d
    set status = 'skipped_pref'::public.delivery_status,
        scheduled_for = null,
        error = 'maintenance_stopped'
    from public.notifications n
    where n.id = d.notification_id
      and n.user_id = cast(:user_id as uuid)
      and n.formation_id = cast(:formation_id as uuid)
      and d.status in ('scheduled', 'deferred_quiet')
    """
)


async def read_final_review_formation(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """CL-1 - the owner or an active member reads the formation, nobody else."""
    result = await tx.conn.execute(
        READ_FINAL_REVIEW_FORMATION, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_final_review_modules(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """The modules with the caller's own progress, by position."""
    result = await tx.conn.execute(
        READ_FINAL_REVIEW_MODULES, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_final_review_notions(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """The notions with the caller's own memory state, in programme order."""
    result = await tx.conn.execute(
        READ_FINAL_REVIEW_NOTIONS, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_final_review_slots(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """CA-3 - the same done/moved rules as the progress indicator, by start instant."""
    result = await tx.conn.execute(
        READ_FINAL_REVIEW_SLOTS, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_final_review_milestones(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """SPEC-723 EF-3 - the milestones of the formation plus the global thresholds."""
    result = await tx.conn.execute(
        READ_FINAL_REVIEW_MILESTONES, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_final_review_retention_modules(
    tx: Tx, user_id: str, formation_id: str
) -> list[Mapping[str, Any]]:
    """The validated modules and the notions each one teaches."""
    result = await tx.conn.execute(
        READ_FINAL_REVIEW_RETENTION_MODULES, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_final_review_reviews(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """Every persisted review of the formation, for the retention horizon."""
    result = await tx.conn.execute(
        READ_FINAL_REVIEW_REVIEWS, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_final_review_due_count(tx: Tx, user_id: str, formation_id: str, now: str) -> int:
    """BR-PRO-03 - the notions still due at the reference instant."""
    result = await tx.conn.execute(
        READ_FINAL_REVIEW_DUE_COUNT,
        {"user_id": user_id, "formation_id": formation_id, "now": now},
    )
    found = result.mappings().all()
    return max(0, int(found[0]["due_count"] or 0)) if found else 0


async def read_final_review_program_version(tx: Tx, user_id: str, formation_id: str) -> int | None:
    """ET-5 - the programme version the bilan refers to, null when not versioned."""
    result = await tx.conn.execute(
        READ_FINAL_REVIEW_PROGRAM_VERSION, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().all()
    value = None if not found else found[0]["version"]
    return None if value is None else int(value)


async def read_final_review_timezone(tx: Tx, user_id: str) -> str:
    """The learner's zone, `UTC` when the profile has none (the join guarantees one)."""
    result = await tx.conn.execute(READ_FINAL_REVIEW_TIMEZONE, {"user_id": user_id})
    found = result.mappings().all()
    return "UTC" if not found else str(found[0]["timezone"])


async def lock_maintenance(tx: Tx, formation_id: str) -> None:
    """Serialises the memory-interview transitions of one formation."""
    await tx.conn.execute(LOCK_MAINTENANCE_EXCLUSIVE, {"key": f"formation-maintenance:{formation_id}"})


async def read_maintenance_formation(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """EF-2, ET-3 - the owner-only formation row, locked for update."""
    result = await tx.conn.execute(
        READ_MAINTENANCE_FORMATION, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def update_maintenance_mode(tx: Tx, user_id: str, formation_id: str, mode: str, now: str) -> None:
    """Stores the chosen memory interview and its content version."""
    await tx.conn.execute(
        UPDATE_MAINTENANCE_MODE,
        {"user_id": user_id, "formation_id": formation_id, "mode": mode, "now": now},
    )


async def cancel_future_slots(tx: Tx, user_id: str, formation_id: str, now: str) -> None:
    """ADR-0112 - a stopped interview cancels every future planned slot of the formation."""
    await tx.conn.execute(CANCEL_FUTURE_SLOTS, {"user_id": user_id, "formation_id": formation_id, "now": now})


async def skip_scheduled_reminders(tx: Tx, user_id: str, formation_id: str) -> None:
    """ADR-0112, ADR-0015 - a stopped interview skips the reminders already scheduled."""
    await tx.conn.execute(SKIP_SCHEDULED_REMINDERS, {"user_id": user_id, "formation_id": formation_id})


# --------------------------------------------------------------------------------------------------
# slots.alternatives, slots.move, formations.replan-options, formations.replan
# (packages/services/src/agenda-deplacer-et-reajuster-le-planning.ts, SPEC-705)
# --------------------------------------------------------------------------------------------------

READ_PLANNING_PROFILE = text(
    """
    select p.timezone,
           sp.hours_per_day,
           sp.study_days,
           sp.preferred_slots::text[] as preferred_slots
    from public.profiles p
    left join public.study_preferences sp on sp.user_id = p.id
    where p.id = cast(:user_id as uuid)
    """
)

READ_PLANNING_FORMATION = text(
    """
    select f.id::text as id,
           f.title,
           f.status::text as status,
           f.start_date::text as start_date,
           f.end_date::text as end_date,
           f.volume_hours,
           f.objectives::text[] as objectives
    from public.formations f
    where f.id = cast(:formation_id as uuid)
      and (f.owner_id = cast(:user_id as uuid) or exists (
        select 1 from public.groups g
        join public.group_members gm on gm.group_id = g.id
        where g.formation_id = f.id
          and gm.user_id = cast(:user_id as uuid)
          and gm.member_status = 'active'
      ))
    """
)

READ_PLANNING_MODULES = text(
    """
    select m.id::text as module_id,
           m.formation_id::text as formation_id,
           m.position::int as position,
           m.title,
           m.status::text as status,
           m.planned_start::text as planned_start,
           m.planned_end::text as planned_end,
           c.id::text as chapter_id,
           c.position::int as chapter_position,
           c.title as chapter_title
    from public.modules m
    left join public.chapters c on c.module_id = m.id
    where m.formation_id = cast(:formation_id as uuid)
    order by m.position, c.position
    """
)

READ_PLANNING_SLOTS = text(
    """
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.kind::text as kind,
           ss.title,
           ss.meta,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status,
           ss.activity_id::text as activity_id,
           ss.created_by::text as created_by,
           ss.moved_from_id::text as moved_from_id,
           ss.group_milestone
    from public.schedule_slots ss
    where ss.user_id = cast(:user_id as uuid)
      and ss.status in ('planned', 'done', 'missed', 'moved')
      and ss.ends_at >= cast(:since as timestamptz)
    """
)

READ_SLOT_OF_USER = text(
    """
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.kind::text as kind,
           ss.title,
           ss.meta,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status,
           ss.activity_id::text as activity_id,
           ss.created_by::text as created_by,
           ss.moved_from_id::text as moved_from_id,
           ss.group_milestone
    from public.schedule_slots ss
    where ss.id = cast(:slot_id as uuid)
      and ss.user_id = cast(:user_id as uuid)
    limit 1
    """
)

READ_MOVED_SUCCESSOR = text(
    """
    select id::text as id
    from public.schedule_slots
    where moved_from_id = cast(:slot_id as uuid)
      and status in ('planned', 'done', 'missed')
    limit 1
    """
)

READ_OVERLAPPING_SLOT = text(
    """
    select id::text as id
    from public.schedule_slots
    where user_id = cast(:user_id as uuid)
      and id <> cast(:slot_id as uuid)
      and status in ('planned', 'done', 'missed')
      and starts_at < cast(:ends_at as timestamptz)
      and ends_at > cast(:starts_at as timestamptz)
    limit 1
    """
)

LOCK_AGENDA_MOVE = text(
    "select pg_advisory_xact_lock(hashtextextended('agenda-move:' || cast(:user_id as text), 0))"
)

LOCK_AGENDA_REPLAN = text(
    "select pg_advisory_xact_lock("
    "hashtextextended('agenda-replan:' || cast(:user_id as text) || ':' || cast(:formation_id as text), 0))"
)

MARK_SLOT_MOVED = text(
    """
    update public.schedule_slots
    set status = 'moved',
        updated_at = cast(:now as timestamptz)
    where id = cast(:slot_id as uuid)
      and user_id = cast(:user_id as uuid)
      and status = 'planned'
    """
)

INSERT_MOVED_SLOT = text(
    """
    insert into public.schedule_slots (
      id, user_id, formation_id, module_id, kind, title, meta, starts_at, ends_at,
      status, activity_id, created_by, moved_from_id, group_milestone, created_at, updated_at
    ) values (
      cast(:id as uuid), cast(:user_id as uuid), cast(:formation_id as uuid),
      cast(:module_id as uuid), cast(:kind as public.slot_kind), :title, :meta,
      cast(:starts_at as timestamptz), cast(:ends_at as timestamptz),
      'planned', cast(:activity_id as uuid), 'learner', cast(:moved_from_id as uuid),
      :group_milestone, cast(:now as timestamptz), cast(:now as timestamptz)
    )
    returning id::text as id
    """
)

READ_TIMEZONE = text("select timezone from public.profiles where id = cast(:user_id as uuid)")

UPDATE_FORMATION_END_DATE = text(
    """
    update public.formations
    set end_date = cast(:end_date as date),
        updated_at = cast(:now as timestamptz)
    where id = cast(:formation_id as uuid)
      and owner_id = cast(:user_id as uuid)
    """
)

UPDATE_HOURS_PER_DAY = text(
    """
    update public.study_preferences
    set hours_per_day = :hours,
        updated_at = cast(:now as timestamptz)
    where user_id = cast(:user_id as uuid)
    """
)

READ_PLANNER_SLOTS_OF_PLAN = text(
    """
    select
      id::text as id,
      planner_key,
      kind::text as kind,
      title,
      module_id::text as module_id,
      starts_at,
      ends_at,
      status::text as status,
      created_by::text as created_by
    from public.schedule_slots
    where user_id = cast(:user_id as uuid)
      and formation_id = cast(:formation_id as uuid)
      and planner_key is not null
    """
)

LOCK_PLANNER = text("select pg_advisory_xact_lock(hashtextextended('planner:' || cast(:user_id as text), 0))")

INSERT_PLANNER_SLOT = text(
    """
    insert into public.schedule_slots (
      user_id, formation_id, module_id, kind, title, starts_at, ends_at,
      status, created_by, planner_key
    ) values (
      cast(:user_id as uuid), cast(:formation_id as uuid), cast(:module_id as uuid),
      cast(:kind as public.slot_kind), :title, cast(:starts_at as timestamptz),
      cast(:ends_at as timestamptz), 'planned', 'planner', :planner_key
    )
    """
)

UPDATE_PLANNER_SLOT = text(
    """
    update public.schedule_slots
    set module_id = cast(:module_id as uuid),
        kind = cast(:kind as public.slot_kind),
        title = :title,
        starts_at = cast(:starts_at as timestamptz),
        ends_at = cast(:ends_at as timestamptz)
    where id = cast(:slot_id as uuid)
      and user_id = cast(:user_id as uuid)
      and status = 'planned'
    """
)

CANCEL_PLANNER_SLOT = text(
    """
    update public.schedule_slots
    set status = 'cancelled'
    where id = cast(:slot_id as uuid)
      and user_id = cast(:user_id as uuid)
      and status = 'planned'
    """
)

INSERT_AUTOMATION_ACTION_QUIET = text(
    """
    insert into public.automation_actions
      (user_id, formation_id, automation, kind, summary, payload, undo_payload,
       requires_consent, status, decided_at, created_at)
    values (
      cast(:user_id as uuid),
      cast(:formation_id as uuid),
      cast(:automation as public.automation_key),
      :kind,
      :summary,
      cast(:payload as jsonb),
      null,
      true,
      'pending_consent'::public.automation_status,
      null,
      cast(:created_at as timestamptz)
    )
    on conflict (user_id, automation, (payload ->> 'dedupeKey')) where payload ? 'dedupeKey'
    do nothing
    returning id::text as id,
              user_id::text as user_id,
              formation_id::text as formation_id,
              automation::text as automation,
              kind,
              summary,
              payload,
              status::text as status,
              created_at
    """
)

READ_AUTOMATION_ACTION_BY_DEDUPE = text(
    """
    select id::text as id,
           user_id::text as user_id,
           formation_id::text as formation_id,
           automation::text as automation,
           kind,
           summary,
           payload,
           status::text as status,
           created_at
    from public.automation_actions
    where user_id = cast(:user_id as uuid)
      and automation = cast(:automation as public.automation_key)
      and payload ->> 'dedupeKey' = :dedupe_key
    limit 1
    """
)


async def read_planning_profile(tx: Tx, user_id: str) -> Mapping[str, Any] | None:
    """The zone, the daily volume, the study days and the preferred moments."""
    result = await tx.conn.execute(READ_PLANNING_PROFILE, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_planning_formation(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """The formation visible to the caller, owner or active member."""
    result = await tx.conn.execute(
        READ_PLANNING_FORMATION, {"user_id": user_id, "formation_id": formation_id}
    )
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_planning_modules(tx: Tx, formation_id: str) -> list[Mapping[str, Any]]:
    """The modules and their chapters, by module position then chapter position."""
    result = await tx.conn.execute(READ_PLANNING_MODULES, {"formation_id": formation_id})
    return [row_of(item) for item in result.mappings().all()]


async def read_planning_slots(tx: Tx, user_id: str, since: str) -> list[Mapping[str, Any]]:
    """The live slots of the learner whose end is not older than the horizon."""
    result = await tx.conn.execute(READ_PLANNING_SLOTS, {"user_id": user_id, "since": since})
    return [row_of(item) for item in result.mappings().all()]


async def read_slot_of_user(tx: Tx, user_id: str, slot_id: str) -> Mapping[str, Any] | None:
    """One slot of the caller, whatever its status."""
    result = await tx.conn.execute(READ_SLOT_OF_USER, {"user_id": user_id, "slot_id": slot_id})
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_moved_successor(tx: Tx, slot_id: str) -> str | None:
    """The single active successor of a moved slot."""
    result = await tx.conn.execute(READ_MOVED_SUCCESSOR, {"slot_id": slot_id})
    found = result.mappings().all()
    return None if not found else str(found[0]["id"])


async def read_overlapping_slot(
    tx: Tx, user_id: str, slot_id: str, starts_at: str, ends_at: str
) -> str | None:
    """The first other live slot that overlaps the new window."""
    result = await tx.conn.execute(
        READ_OVERLAPPING_SLOT,
        {
            "user_id": user_id,
            "slot_id": slot_id,
            "starts_at": starts_at,
            "ends_at": ends_at,
        },
    )
    found = result.mappings().all()
    return None if not found else str(found[0]["id"])


async def lock_agenda_move(tx: Tx, user_id: str) -> None:
    """Serialises the moves of one learner."""
    await tx.conn.execute(LOCK_AGENDA_MOVE, {"user_id": user_id})


async def lock_agenda_replan(tx: Tx, user_id: str, formation_id: str) -> None:
    """Serialises the replans of one learner and one formation."""
    await tx.conn.execute(LOCK_AGENDA_REPLAN, {"user_id": user_id, "formation_id": formation_id})


async def mark_slot_moved(tx: Tx, user_id: str, slot_id: str, now: str) -> None:
    """A moved slot is never rewritten: the new slot references it."""
    await tx.conn.execute(MARK_SLOT_MOVED, {"user_id": user_id, "slot_id": slot_id, "now": now})


async def insert_moved_slot(
    tx: Tx,
    *,
    slot_id: str,
    user_id: str,
    formation_id: str,
    module_id: str | None,
    kind: str,
    title: str,
    meta: str | None,
    starts_at: str,
    ends_at: str,
    activity_id: str | None,
    moved_from_id: str,
    group_milestone: bool,
    now: str,
) -> str | None:
    """The successor of a moved slot, created by the learner."""
    result = await tx.conn.execute(
        INSERT_MOVED_SLOT,
        {
            "id": slot_id,
            "user_id": user_id,
            "formation_id": formation_id,
            "module_id": module_id,
            "kind": kind,
            "title": title,
            "meta": meta,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "activity_id": activity_id,
            "moved_from_id": moved_from_id,
            "group_milestone": group_milestone,
            "now": now,
        },
    )
    found = result.mappings().all()
    return None if not found else str(found[0]["id"])


async def read_timezone(tx: Tx, user_id: str) -> str | None:
    """The learner's IANA zone."""
    result = await tx.conn.execute(READ_TIMEZONE, {"user_id": user_id})
    found = result.mappings().all()
    return None if not found else str(found[0]["timezone"])


async def update_formation_end_date(tx: Tx, user_id: str, formation_id: str, end_date: str, now: str) -> None:
    """`shift_end` - the owner moves the formation end date."""
    await tx.conn.execute(
        UPDATE_FORMATION_END_DATE,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "end_date": end_date,
            "now": now,
        },
    )


async def update_hours_per_day(tx: Tx, user_id: str, hours: int, now: str) -> None:
    """`increase_volume` - the daily volume of the learner."""
    await tx.conn.execute(UPDATE_HOURS_PER_DAY, {"user_id": user_id, "hours": hours, "now": now})


async def read_planner_slots_of_plan(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """The planner-owned slots of the formation, keyed by `planner_key`."""
    result = await tx.conn.execute(
        READ_PLANNER_SLOTS_OF_PLAN, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


async def lock_planner(tx: Tx, user_id: str) -> None:
    """Serialises the plan reconciliation of one learner."""
    await tx.conn.execute(LOCK_PLANNER, {"user_id": user_id})


async def insert_planner_slot(
    tx: Tx,
    *,
    user_id: str,
    formation_id: str,
    module_id: str | None,
    kind: str,
    title: str,
    starts_at: str,
    ends_at: str,
    planner_key: str,
) -> None:
    """A computed future slot that does not exist yet."""
    await tx.conn.execute(
        INSERT_PLANNER_SLOT,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "module_id": module_id,
            "kind": kind,
            "title": title,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "planner_key": planner_key,
        },
    )


async def update_planner_slot(
    tx: Tx,
    *,
    user_id: str,
    slot_id: str,
    module_id: str | None,
    kind: str,
    title: str,
    starts_at: str,
    ends_at: str,
) -> None:
    """A computed future slot whose content changed."""
    await tx.conn.execute(
        UPDATE_PLANNER_SLOT,
        {
            "user_id": user_id,
            "slot_id": slot_id,
            "module_id": module_id,
            "kind": kind,
            "title": title,
            "starts_at": starts_at,
            "ends_at": ends_at,
        },
    )


async def cancel_planner_slot(tx: Tx, user_id: str, slot_id: str) -> None:
    """A planned planner slot missing from the new plan."""
    await tx.conn.execute(CANCEL_PLANNER_SLOT, {"user_id": user_id, "slot_id": slot_id})


async def insert_automation_action_quiet(
    tx: Tx,
    *,
    user_id: str,
    formation_id: str,
    automation: str,
    kind: str,
    summary: str,
    payload: Mapping[str, Any],
    created_at: str,
) -> Mapping[str, Any] | None:
    """`createAutomationActionQuiet`: one pending action, deduplicated by its payload key."""
    import json

    result = await tx.conn.execute(
        INSERT_AUTOMATION_ACTION_QUIET,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "automation": automation,
            "kind": kind,
            "summary": summary,
            "payload": json.dumps(dict(payload), ensure_ascii=False),
            "created_at": created_at,
        },
    )
    found = result.mappings().all()
    return None if not found else row_of(found[0])


async def read_automation_action_by_dedupe(
    tx: Tx, user_id: str, automation: str, dedupe_key: str
) -> Mapping[str, Any] | None:
    """The pending action already stored for this dedupe key."""
    result = await tx.conn.execute(
        READ_AUTOMATION_ACTION_BY_DEDUPE,
        {"user_id": user_id, "automation": automation, "dedupe_key": dedupe_key},
    )
    found = result.mappings().all()
    return None if not found else row_of(found[0])
