"""SQL of the learning context (SPEC-2202).

`${x}` placeholders become bound `:x` parameters and nothing here reads the clock.
"""

from collections.abc import Mapping
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx


def row_of(found: Any) -> dict[str, Any]:
    """A plain mapping: SQLAlchemy returns `RowMapping`, which cannot be indexed cheaply."""
    return dict(found)


# --------------------------------------------------------------------------------------------------
# agenda.get
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
# gaps.list
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
# series.streak, series.milestones (
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
#
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
#
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


# --------------------------------------------------------------------------------------------------
# warmups.today.get
# --------------------------------------------------------------------------------------------------

READ_WARMUP_PROFILE = text("select timezone from public.profiles where id = cast(:user_id as uuid)")

READ_WARMUPS_TODAY = text(
    """
    select a.id::text as id,
           a.formation_id::text as formation_id,
           a.module_id::text as module_id,
           m.position as module_position,
           a.config,
           a.items,
           a.status::text as status,
           a.for_date::text as for_date,
           t.id::text as attempt_id,
           t.status::text as attempt_status,
           t.submitted_at as attempt_submitted_at,
           (
             select ss.starts_at
             from public.schedule_slots ss
             where ss.activity_id = a.id
               and ss.status in ('planned', 'done', 'moved')
             order by ss.starts_at desc
             limit 1
           ) as slot_starts_at,
           (
             select (aa.payload ->> 'reviewRemaining')::boolean
             from public.automation_actions aa
             where aa.user_id = a.owner_id
               and aa.automation = 'echauffement'
               and (aa.payload ->> 'activityId') = a.id::text
             order by aa.created_at desc
             limit 1
           ) as review_remaining
    from public.activities a
    left join public.modules m on m.id = a.module_id
    left join public.attempts t
      on t.activity_id = a.id and t.user_id = a.owner_id and t.attempt_no = 1
    where a.owner_id = cast(:user_id as uuid)
      and a.kind = 'warmup'
      and a.for_date = cast(:today as date)
      and a.status = 'ready'
    order by a.created_at asc
    """
)

READ_WARMUP_DAY_SESSIONS = text(
    """
    select ss.id::text as id,
           ss.kind::text as kind,
           ss.starts_at,
           ss.module_id::text as module_id,
           ss.activity_id::text as activity_id
    from public.schedule_slots ss
    where ss.user_id = cast(:user_id as uuid)
      and ss.formation_id = cast(:formation_id as uuid)
      and ss.status = 'planned'
      and ss.kind::text in ('course', 'exercise', 'validation_quiz', 'contributions', 'mock_exam')
      and ss.starts_at >= cast(:day_start as timestamptz)
      and ss.starts_at < cast(:day_end as timestamptz)
    order by ss.starts_at asc
    """
)

READ_WARMUP_VERSIONS = text(
    """
    select bv.id::text as version_id,
           b.id::text as brick_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           bv.payload
    from public.brick_versions bv
    join public.bricks b on b.id = bv.brick_id
    where bv.id = any(
      array(select jsonb_array_elements_text(cast(:version_ids as jsonb))::uuid)
    )
    """
)

READ_WARMUP_NOTIONS = text(
    """
    select n.id::text as id, n.label, m.position as module_position
    from public.notions n
    join public.modules m on m.id = n.module_id
    where n.id = any(
      array(select jsonb_array_elements_text(cast(:notion_ids as jsonb))::uuid)
    )
    """
)

READ_WARMUP_ANSWERS = text(
    """
    select position, is_correct, response
    from public.answers
    where attempt_id = cast(:attempt_id as uuid)
    order by position asc
    """
)


async def read_warmup_timezone(tx: Tx, user_id: str) -> str:
    """The learner's zone, `Europe/Paris` when the profile has none."""
    result = await tx.conn.execute(READ_WARMUP_PROFILE, {"user_id": user_id})
    found = result.mappings().all()
    return "Europe/Paris" if not found else str(found[0]["timezone"])


async def read_warmups_today(tx: Tx, user_id: str, today: str) -> list[Mapping[str, Any]]:
    """EF-7 - the ready warm-ups of the civil day, oldest first."""
    result = await tx.conn.execute(READ_WARMUPS_TODAY, {"user_id": user_id, "today": today})
    return [row_of(item) for item in result.mappings().all()]


async def read_warmup_day_sessions(
    tx: Tx, user_id: str, formation_id: str, day_start: str, day_end: str
) -> list[Mapping[str, Any]]:
    """EF-2 - the planned sessions of the day, ordered, so the next one is chosen in memory."""
    result = await tx.conn.execute(
        READ_WARMUP_DAY_SESSIONS,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "day_start": day_start,
            "day_end": day_end,
        },
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_warmup_versions(tx: Tx, version_ids: list[str]) -> list[Mapping[str, Any]]:
    """The exact brick versions the activity stores, with their notions."""
    import json

    if not version_ids:
        return []
    result = await tx.conn.execute(READ_WARMUP_VERSIONS, {"version_ids": json.dumps(version_ids)})
    return [row_of(item) for item in result.mappings().all()]


async def read_warmup_notions(tx: Tx, notion_ids: list[str]) -> list[Mapping[str, Any]]:
    """The labels of the notions used by the warm-up."""
    import json

    if not notion_ids:
        return []
    result = await tx.conn.execute(READ_WARMUP_NOTIONS, {"notion_ids": json.dumps(notion_ids)})
    return [row_of(item) for item in result.mappings().all()]


async def read_warmup_answers(tx: Tx, attempt_id: str) -> list[Mapping[str, Any]]:
    """The recorded first-pass answers of the attempt, by position."""
    result = await tx.conn.execute(READ_WARMUP_ANSWERS, {"attempt_id": attempt_id})
    return [row_of(item) for item in result.mappings().all()]


# --------------------------------------------------------------------------------------------------
# learning/apply-result.ts (SPEC-411 ET-1, ET-4) - journal application of the corrected answers
# --------------------------------------------------------------------------------------------------

READ_NEWER_REVIEW_LOG = text(
    """
    select reviewed_at::text as reviewed_at
      from public.review_logs
     where user_id = cast(:user_id as uuid)
       and notion_id = cast(:notion_id as uuid)
       and reviewed_at > cast(:reviewed_at as timestamptz)
     order by reviewed_at desc
     limit 1
    """
)

READ_NOTION_STATES_FOR_UPDATE = text(
    """
    select notion_id::text as notion_id,
           fsrs,
           due_at,
           mastery::text as mastery,
           first_seen_at,
           last_seen_at,
           success_count,
           gap_nature::text as gap_nature,
           gap_confused_with::text as gap_confused_with,
           gap_detected_at,
           gap_evidence,
           gap_cleared_at,
           in_review
      from public.notion_states
     where user_id = cast(:user_id as uuid)
       and notion_id = any(
         array(select jsonb_array_elements_text(cast(:notion_ids as jsonb))::uuid)
       )
       for update
    """
)

READ_NOTION_HISTORY = text(
    """
    select a.id::text as answer_id,
           a.attempt_id::text as attempt_id,
           at.attempt_no,
           act.kind::text as attempt_kind,
           b.type::text as brick_type,
           b.notion_ids::text[] as notion_ids,
           a.position,
           a.is_correct,
           a.score::text as score,
           a.max_score::text as max_score,
           a.time_ms,
           a.answered_at,
           a.chosen_distractor_notion_id::text as chosen_distractor_notion_id,
           a.response,
           a.feedback
      from public.answers a
      join public.attempts at on at.id = a.attempt_id
      join public.activities act on act.id = at.activity_id
      join public.brick_versions bv on bv.id = a.brick_version_id
      join public.bricks b on b.id = bv.brick_id
     where at.user_id = cast(:user_id as uuid)
       and b.notion_ids @> array[cast(:notion_id as uuid)]
       and a.is_correct is not null
     order by a.answered_at, a.id
    """
)

READ_TIMED_HISTORY = text(
    """
    select a.id::text as answer_id,
           a.answered_at,
           a.time_ms,
           b.type::text as brick_type
      from public.answers a
      join public.attempts at on at.id = a.attempt_id
      join public.brick_versions bv on bv.id = a.brick_version_id
      join public.bricks b on b.id = bv.brick_id
     where at.user_id = cast(:user_id as uuid)
       and a.time_ms is not null
       and a.time_ms > 0
     order by a.answered_at desc, a.id desc
     limit 500
    """
)

READ_APPLIED_REVIEW_KEYS = text(
    """
    select answer_id::text as answer_id, notion_id::text as notion_id
      from public.review_logs
     where user_id = cast(:user_id as uuid)
       and answer_id = any(
         array(select jsonb_array_elements_text(cast(:answer_ids as jsonb))::uuid)
       )
    """
)

READ_FORMATION_NOTIONS = text(
    """
    select id::text as id, formation_id::text as formation_id
      from public.notions
     where formation_id = cast(:formation_id as uuid)
       and id = any(
         array(select jsonb_array_elements_text(cast(:notion_ids as jsonb))::uuid)
       )
    """
)

UPSERT_NOTION_STATE = text(
    """
    insert into public.notion_states (
      user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at, success_count,
      in_review, gap_nature, gap_confused_with, gap_detected_at, gap_evidence, gap_cleared_at,
      revision
    ) values (
      cast(:user_id as uuid),
      cast(:notion_id as uuid),
      cast(:fsrs as jsonb),
      cast(:due_at as timestamptz),
      cast(:mastery as numeric),
      cast(:first_seen_at as timestamptz),
      cast(:last_seen_at as timestamptz),
      :success_count,
      true,
      cast(:gap_nature as public.gap_nature),
      cast(:gap_confused_with as uuid),
      cast(:gap_detected_at as timestamptz),
      :gap_evidence,
      cast(:gap_cleared_at as timestamptz),
      1
    )
    on conflict (user_id, notion_id) do update set
      fsrs = excluded.fsrs,
      due_at = excluded.due_at,
      mastery = excluded.mastery,
      first_seen_at = coalesce(notion_states.first_seen_at, excluded.first_seen_at),
      last_seen_at = excluded.last_seen_at,
      success_count = excluded.success_count,
      in_review = true,
      gap_nature = excluded.gap_nature,
      gap_confused_with = excluded.gap_confused_with,
      gap_detected_at = excluded.gap_detected_at,
      gap_evidence = excluded.gap_evidence,
      gap_cleared_at = excluded.gap_cleared_at,
      revision = notion_states.revision + 1
    """
)

APPEND_REVIEW_LOG = text(
    """
    select public.append_review_log(
      cast(:user_id as uuid),
      cast(:notion_id as uuid),
      cast(:answer_id as uuid),
      cast(:source as public.review_source),
      cast(:rating as public.fsrs_grade),
      :correct,
      cast(:time_ms as integer),
      cast(:reviewed_at as timestamptz),
      cast(:card_before as jsonb),
      cast(:card_after as jsonb)
    ) as id
    """
)

APPEND_GAP_EVENT = text(
    """
    select public.append_gap_event(
      cast(:user_id as uuid),
      cast(:notion_id as uuid),
      cast(:kind as public.gap_event_kind),
      cast(:nature as public.gap_nature),
      cast(:evidence as jsonb),
      cast(:reviewed_at as timestamptz)
    )
    """
)

UPSERT_DAILY_ACTIVITY = text(
    """
    insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
    values (
      cast(:user_id as uuid),
      cast(:day as date),
      :minutes,
      :qualifying,
      array(select jsonb_array_elements_text(cast(:sources as jsonb)))
    )
    on conflict (user_id, day) do update set
      minutes = public.daily_activity.minutes + case when (
        cardinality(array(select jsonb_array_elements_text(cast(:sources as jsonb)))) > 0
        and not exists (
          select 1
            from unnest(array(select jsonb_array_elements_text(cast(:sources as jsonb)))) as candidate
           where candidate <> all (public.daily_activity.sources)
        )
      ) then 0 else :minutes end,
      qualifying = public.daily_activity.qualifying or (
        not (
          cardinality(array(select jsonb_array_elements_text(cast(:sources as jsonb)))) > 0
          and not exists (
            select 1
              from unnest(array(select jsonb_array_elements_text(cast(:sources as jsonb)))) as candidate
             where candidate <> all (public.daily_activity.sources)
          )
        )
        and :qualifying
      ),
      sources = (
        select coalesce(array_agg(distinct element order by element), '{}'::text[])
          from unnest(
            public.daily_activity.sources
            || array(select jsonb_array_elements_text(cast(:sources as jsonb)))
          ) as element
      )
    returning day::text as day, minutes, qualifying
    """
)

CONSUME_AUTOMATION_ACTION = text(
    """
    update public.automation_actions
       set status = 'consumed'
     where id = cast(:action_id as uuid)
       and user_id = cast(:user_id as uuid)
       and status = 'applied'
    returning id::text as id
    """
)

CONSUME_AUTOMATION_ACTIONS_OF_DAY = text(
    """
    update public.automation_actions
       set status = 'consumed',
           summary = coalesce(payload ->> 'summaryConsumed', summary)
     where user_id = cast(:user_id as uuid)
       and automation = cast(:automation as public.automation_key)
       and status = 'applied'
       and payload ->> 'date' = :day
    returning id::text as id, undo_payload
    """
)

COMPLETE_SLOT_OF_ACTION = text(
    """
    update public.schedule_slots
       set status = 'done', updated_at = now()
     where id = cast(:slot_id as uuid)
       and user_id = cast(:user_id as uuid)
       and status = 'planned'
    """
)


async def read_newer_review_log(tx: Tx, user_id: str, notion_id: str, reviewed_at: str) -> bool:
    """SPEC-801 ET-8 - an older synchronised answer never regresses the current card."""
    result = await tx.conn.execute(
        READ_NEWER_REVIEW_LOG,
        {"user_id": user_id, "notion_id": notion_id, "reviewed_at": reviewed_at},
    )
    return result.mappings().first() is not None


async def read_notion_states_for_update(
    tx: Tx, user_id: str, notion_ids: list[str]
) -> list[Mapping[str, Any]]:
    """The locked states of the given notions; an absent row means a new notion."""
    import json

    if not notion_ids:
        return []
    result = await tx.conn.execute(
        READ_NOTION_STATES_FOR_UPDATE,
        {"user_id": user_id, "notion_ids": json.dumps(notion_ids)},
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_notion_history(tx: Tx, user_id: str, notion_id: str) -> list[Mapping[str, Any]]:
    """Every graded answer of one notion, oldest first (mastery, gaps and median input)."""
    result = await tx.conn.execute(READ_NOTION_HISTORY, {"user_id": user_id, "notion_id": notion_id})
    return [row_of(item) for item in result.mappings().all()]


async def read_timed_history(tx: Tx, user_id: str) -> list[Mapping[str, Any]]:
    """The 500 most recent timed answers of the learner, newest first."""
    result = await tx.conn.execute(READ_TIMED_HISTORY, {"user_id": user_id})
    return [row_of(item) for item in result.mappings().all()]


async def read_applied_review_keys(tx: Tx, user_id: str, answer_ids: list[str]) -> set[tuple[str, str]]:
    """The `(answer, notion)` pairs already journaled, so a replay writes nothing."""
    import json

    if not answer_ids:
        return set()
    result = await tx.conn.execute(
        READ_APPLIED_REVIEW_KEYS, {"user_id": user_id, "answer_ids": json.dumps(answer_ids)}
    )
    return {(str(item["answer_id"]), str(item["notion_id"])) for item in result.mappings().all()}


async def read_formation_notions(tx: Tx, formation_id: str, notion_ids: list[str]) -> list[Mapping[str, Any]]:
    """The notions of the formation among the given identifiers."""
    import json

    if not notion_ids:
        return []
    result = await tx.conn.execute(
        READ_FORMATION_NOTIONS,
        {"formation_id": formation_id, "notion_ids": json.dumps(notion_ids)},
    )
    return [row_of(item) for item in result.mappings().all()]


async def upsert_notion_state(
    tx: Tx,
    *,
    user_id: str,
    notion_id: str,
    fsrs: str,
    due_at: str,
    mastery: str,
    first_seen_at: str,
    last_seen_at: str,
    success_count: int,
    gap: Mapping[str, Any] | None,
) -> None:
    """Writes one notion state exactly like `persistStep` (the journal follows separately)."""

    await tx.conn.execute(
        UPSERT_NOTION_STATE,
        {
            "user_id": user_id,
            "notion_id": notion_id,
            "fsrs": fsrs,
            "due_at": due_at,
            "mastery": mastery,
            "first_seen_at": first_seen_at,
            "last_seen_at": last_seen_at,
            "success_count": success_count,
            "gap_nature": None if gap is None else gap["nature"],
            "gap_confused_with": None if gap is None else gap["confusedWith"],
            "gap_detected_at": None if gap is None else gap["detectedAt"],
            "gap_evidence": None if gap is None else gap["evidence"],
            "gap_cleared_at": None if gap is None else gap["clearedAt"],
        },
    )


async def append_review_log(
    tx: Tx,
    *,
    user_id: str,
    notion_id: str,
    answer_id: str,
    source: str,
    rating: str,
    correct: bool,
    time_ms: float,
    reviewed_at: str,
    card_before: str,
    card_after: str,
) -> bool:
    """Appends one review log through the security-definer function; `False` on a replay."""
    result = await tx.conn.execute(
        APPEND_REVIEW_LOG,
        {
            "user_id": user_id,
            "notion_id": notion_id,
            "answer_id": answer_id,
            "source": source,
            "rating": rating,
            "correct": correct,
            "time_ms": time_ms,
            "reviewed_at": reviewed_at,
            "card_before": card_before,
            "card_after": card_after,
        },
    )
    found = result.mappings().first()
    return found is not None and found["id"] is not None


async def append_gap_event(
    tx: Tx,
    *,
    user_id: str,
    notion_id: str,
    kind: str,
    nature: str | None,
    evidence: str,
    reviewed_at: str,
) -> None:
    """Appends one gap lifecycle event through the security-definer function."""
    await tx.conn.execute(
        APPEND_GAP_EVENT,
        {
            "user_id": user_id,
            "notion_id": notion_id,
            "kind": kind,
            "nature": nature,
            "evidence": evidence,
            "reviewed_at": reviewed_at,
        },
    )


async def upsert_daily_activity(
    tx: Tx,
    *,
    user_id: str,
    day: str,
    minutes: int,
    qualifying: bool,
    sources: list[str],
) -> Mapping[str, Any]:
    """EF-4, CL-5 - the local day row; a replayed source adds neither minutes nor qualification."""
    import json

    result = await tx.conn.execute(
        UPSERT_DAILY_ACTIVITY,
        {
            "user_id": user_id,
            "day": day,
            "minutes": minutes,
            "qualifying": qualifying,
            "sources": json.dumps(sorted(set(sources))),
        },
    )
    return row_of(result.mappings().one())


async def consume_automation_action(tx: Tx, user_id: str, action_id: str) -> list[str]:
    """Marks one applied action consumed; returns the consumed identifiers."""
    result = await tx.conn.execute(CONSUME_AUTOMATION_ACTION, {"user_id": user_id, "action_id": action_id})
    return [str(item["id"]) for item in result.mappings().all()]


async def consume_automation_actions_of_day(
    tx: Tx, *, user_id: str, automation: str, day: str, complete_slots: bool
) -> list[Mapping[str, Any]]:
    """SPEC-713 EF-6 - every applied action of one automation for the civil day."""
    result = await tx.conn.execute(
        CONSUME_AUTOMATION_ACTIONS_OF_DAY,
        {"user_id": user_id, "automation": automation, "day": day},
    )
    consumed: list[Mapping[str, Any]] = [row_of(item) for item in result.mappings().all()]
    if complete_slots:
        for action in consumed:
            undo = action["undo_payload"]
            slot_id = None if not isinstance(undo, Mapping) else undo.get("slotId")
            if not isinstance(slot_id, str) or slot_id == "":
                continue
            await tx.conn.execute(COMPLETE_SLOT_OF_ACTION, {"slot_id": slot_id, "user_id": user_id})
    return consumed


# --------------------------------------------------------------------------------------------------
# review/global-quiz.ts (SPEC-701) - daily session of the global quiz
# --------------------------------------------------------------------------------------------------

READ_QUIZ_FORMATION = text(
    """
    select f.id::text as id, f.title, f.status::text as status
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

READ_QUIZ_DUE_ROWS = text(
    """
    select ns.notion_id::text as notion_id,
           n.label,
           n.module_id::text as module_id,
           m.position as module_position,
           ns.in_review,
           ns.due_at,
           ns.gap_nature::text as gap_nature,
           ns.gap_detected_at,
           ns.gap_cleared_at,
           ns.fsrs
      from public.notion_states ns
      join public.notions n on n.id = ns.notion_id
      join public.modules m on m.id = n.module_id
     where ns.user_id = cast(:user_id as uuid)
       and n.formation_id = cast(:formation_id as uuid)
       and not ns.suspended
       and ns.due_at <= cast(:day_end as timestamptz)
     order by m.position asc, ns.due_at asc, n.id asc
    """
)

READ_QUIZ_ACTIVE_BRICKS = text(
    """
    select b.id::text as brick_id,
           bv.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           bv.payload,
           b.status::text as status,
           bv.fingerprint,
           bv.origin::text as origin
      from public.bricks b
      join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
     where b.owner_id = cast(:user_id as uuid)
       and b.formation_id = cast(:formation_id as uuid)
       and b.status = 'active'
       and b.purpose in ('review', 'bank')
    """
)

READ_QUIZ_LAST_FORMATS = text(
    """
    select b.notion_ids::text[] as notion_ids, b.type::text as type
      from public.answers a
      join public.attempts at on at.id = a.attempt_id
      join public.activities act on act.id = at.activity_id
      join public.brick_versions bv on bv.id = a.brick_version_id
      join public.bricks b on b.id = bv.brick_id
     where at.user_id = cast(:user_id as uuid)
       and act.formation_id = cast(:formation_id as uuid)
       and a.is_correct is not null
       and (a.response is null or (a.response ->> 'skipped') is null)
     order by a.answered_at desc
     limit 20
    """
)

READ_QUIZ_AUTOMATION_PARAMS = text(
    """
    select key::text as key, enabled, params
      from public.automation_settings
     where user_id = cast(:user_id as uuid)
       and key in ('plafond_quiz', 'jeu_lacune', 'micro_seance')
    """
)

READ_QUIZ_SMOOTHING_ACTIONS = text(
    """
    select id::text as id, status::text as status, payload, created_at
      from public.automation_actions
     where user_id = cast(:user_id as uuid)
       and formation_id = cast(:formation_id as uuid)
       and automation = 'plafond_quiz'
       and kind = 'quiz_smoothed'
     order by created_at desc, id desc
    """
)

READ_QUIZ_FORCED_ACTIONS = text(
    """
    select id::text as id, automation::text as automation, kind, status::text as status, payload
      from public.automation_actions
     where user_id = cast(:user_id as uuid)
       and formation_id = cast(:formation_id as uuid)
       and (
         (automation = 'jeu_lacune' and kind = 'game_chosen')
         or (automation = :question_card_automation and kind = :question_card_kind)
       )
       and status = 'applied'
     order by created_at desc, id desc
    """
)

READ_QUIZ_SEEN_FINGERPRINTS = text(
    """
    select distinct bv.fingerprint
      from public.answers a
      join public.attempts at on at.id = a.attempt_id
      join public.brick_versions bv on bv.id = a.brick_version_id
     where at.user_id = cast(:user_id as uuid) and bv.fingerprint is not null
    """
)

READ_QUIZ_TODAY_ACTIVITY = text(
    """
    select a.id::text as id,
           a.formation_id::text as formation_id,
           a.config,
           a.items,
           a.status::text as status,
           a.for_date::text as for_date,
           at.id::text as attempt_id,
           at.attempt_no,
           at.status::text as attempt_status,
           at.started_at,
           at.review_feedback
      from public.activities a
      left join lateral (
        select * from public.attempts
         where activity_id = a.id and user_id = cast(:user_id as uuid)
         order by attempt_no desc limit 1
      ) at on true
     where a.owner_id = cast(:user_id as uuid)
       and a.formation_id = cast(:formation_id as uuid)
       and a.kind = 'global_quiz_session'::public.activity_kind
       and a.for_date = cast(:today as date)
       and a.config ->> 'mode' = :mode
     order by a.created_at desc, a.id desc
     limit 1
    """
)

READ_QUIZ_STALE_SESSIONS = text(
    """
    select a.id::text as id, at.id::text as attempt_id
      from public.activities a
      join public.attempts at on at.activity_id = a.id and at.status = 'in_progress'
     where a.owner_id = cast(:user_id as uuid)
       and a.kind = 'global_quiz_session'::public.activity_kind
       and a.for_date is not null
       and a.for_date < cast(:today as date)
    """
)

READ_QUIZ_ATTEMPT_FOR_CLOSURE = text(
    """
    select a.config, a.items
      from public.activities a
      join public.attempts at on at.activity_id = a.id
     where at.id = cast(:attempt_id as uuid)
       and a.owner_id = cast(:user_id as uuid)
       and a.kind = 'global_quiz_session'::public.activity_kind
       and at.status = 'in_progress'
       for update of a
    """
)

READ_ATTEMPT_POSITIONS = text(
    """
    select position from public.answers where attempt_id = cast(:attempt_id as uuid)
    """
)

INSERT_SKIPPED_ANSWER = text(
    """
    insert into public.answers
      (attempt_id, brick_version_id, position, response, is_correct, time_ms, graded_by,
       feedback, answered_at)
    values (
      cast(:attempt_id as uuid),
      cast(:brick_version_id as uuid),
      :position,
      cast(:response as jsonb),
      null,
      0,
      'code',
      cast(:feedback as jsonb),
      cast(:answered_at as timestamptz)
    )
    on conflict (attempt_id, position) do nothing
    """
)

CLOSE_STALE_ATTEMPT = text(
    """
    update public.attempts
       set status = 'abandoned',
           submitted_at = cast(:now as timestamptz),
           duration_ms = greatest(0, cast(:now_ms as bigint) - extract(epoch from started_at)::bigint * 1000)
     where id = cast(:attempt_id as uuid) and status = 'in_progress'
    """
)

INSTALL_QUIZ_ACTIVITY = text(
    """
    insert into public.activities
      (id, owner_id, formation_id, module_id, kind, config, items, status, for_date, created_at)
    values (
      cast(:activity_id as uuid),
      cast(:user_id as uuid),
      cast(:formation_id as uuid),
      null,
      'global_quiz_session'::public.activity_kind,
      cast(:config as jsonb),
      cast(:items as jsonb),
      'ready',
      cast(:today as date),
      cast(:created_at as timestamptz)
    )
    """
)

INSTALL_QUIZ_ATTEMPT = text(
    """
    insert into public.attempts (id, user_id, activity_id, attempt_no, status, started_at, created_at)
    values (
      cast(:attempt_id as uuid),
      cast(:user_id as uuid),
      cast(:activity_id as uuid),
      1,
      'in_progress',
      cast(:created_at as timestamptz),
      cast(:created_at as timestamptz)
    )
    """
)

READ_SESSION_BRICKS = text(
    """
    select b.id::text as brick_id,
           bv.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           bv.payload,
           b.status::text as status,
           bv.fingerprint,
           bv.origin::text as origin
      from public.brick_versions bv
      join public.bricks b on b.id = bv.brick_id
     where bv.id = any(
       array(select jsonb_array_elements_text(cast(:version_ids as jsonb))::uuid)
     )
    """
)

READ_SESSION_ANSWERS = text(
    """
    select id::text as id, position, is_correct, response, feedback, time_ms
      from public.answers
     where attempt_id = cast(:attempt_id as uuid)
     order by position
    """
)

READ_SESSION_NOTIONS = text(
    """
    select n.id::text as id, n.label, m.position as module_position, ch.position as chapter_position
      from public.notions n
      join public.modules m on m.id = n.module_id
      join public.chapters ch on ch.id = n.chapter_id
     where n.id = any(
       array(select jsonb_array_elements_text(cast(:notion_ids as jsonb))::uuid)
     )
    """
)

READ_SESSION_CARDS = text(
    """
    select notion_id::text as notion_id, fsrs
      from public.notion_states
     where user_id = cast(:user_id as uuid)
       and notion_id = any(
         array(select jsonb_array_elements_text(cast(:notion_ids as jsonb))::uuid)
       )
    """
)

READ_ANSWER_OUTCOMES = text(
    """
    select rl.answer_id::text as answer_id,
           rl.notion_id::text as notion_id,
           rl.grade::text as grade,
           ns.due_at::text as due_at
      from public.review_logs rl
      join public.answers a on a.id = rl.answer_id
      join public.notion_states ns on ns.notion_id = rl.notion_id and ns.user_id = rl.user_id
     where rl.user_id = cast(:user_id as uuid)
       and a.attempt_id = cast(:attempt_id as uuid)
     order by rl.notion_id
    """
)

UPDATE_SESSION_ITEM_FLAGS = text(
    """
    update public.activities
       set config = jsonb_set(
             jsonb_set(
               config,
               array['items', :position_text, 'withdrawn'],
               cast(:withdrawn as jsonb)
             ),
             array['items', :position_text, 'invalid'],
             cast(:invalid as jsonb)
           )
     where id = cast(:activity_id as uuid)
    """
)

RETIRE_BRICK = text(
    """
    update public.bricks set status = 'retired'
     where id = cast(:brick_id as uuid) and status <> 'retired'
    """
)

READ_MODE_OPTIONS = text(
    """
    select config
      from public.activities
     where owner_id = cast(:user_id as uuid)
       and formation_id = cast(:formation_id as uuid)
       and kind = 'global_quiz_session'::public.activity_kind
       and for_date = cast(:today as date)
    """
)

READ_QUIZ_ACTIVITY_FOR_UPDATE = text(
    """
    select id::text as id, owner_id::text as owner_id, config, items, formation_id::text as formation_id
      from public.activities
     where id = cast(:activity_id as uuid)
       for update
    """
)

READ_LATEST_ATTEMPT = text(
    """
    select id::text as id, attempt_no, status::text as status, started_at, review_feedback
      from public.attempts
     where activity_id = cast(:activity_id as uuid)
     order by attempt_no desc
     limit 1
    """
)

READ_ATTEMPT_ANSWER_ROWS = text(
    """
    select id::text as id, position, is_correct, response, time_ms
      from public.answers
     where attempt_id = cast(:attempt_id as uuid)
    """
)

MARK_ATTEMPT_GRADED = text(
    """
    update public.attempts
       set status = 'graded',
           submitted_at = cast(:submitted_at as timestamptz),
           duration_ms = :duration_ms,
           score = :score
     where id = cast(:attempt_id as uuid)
    """
)

STORE_ATTEMPT_SUMMARY = text(
    """
    update public.attempts
       set review_feedback = cast(:review_feedback as jsonb)
     where id = cast(:attempt_id as uuid)
    """
)

READ_PROFILE_STREAK_FOR_UPDATE = text(
    """
    select streak_days, streak_computed_on::text as streak_computed_on
      from public.profiles
     where id = cast(:user_id as uuid)
       for update
    """
)

READ_YESTERDAY_QUALIFYING = text(
    """
    select qualifying from public.daily_activity
     where user_id = cast(:user_id as uuid) and day = cast(:yesterday as date)
    """
)

UPDATE_PROFILE_STREAK = text(
    """
    update public.profiles
       set streak_days = :streak, streak_computed_on = cast(:day as date), updated_at = now()
     where id = cast(:user_id as uuid)
    """
)

READ_PROFILE_STREAK = text(
    """
    select streak_days from public.profiles where id = cast(:user_id as uuid)
    """
)

COMPLETE_QUIZ_SLOTS = text(
    """
    update public.schedule_slots
       set status = 'done', updated_at = cast(:now as timestamptz)
     where user_id = cast(:user_id as uuid)
       and formation_id = cast(:formation_id as uuid)
       and kind = 'global_quiz'
       and status = 'planned'
       and (starts_at at time zone :timezone)::date = cast(:day as date)
    """
)

READ_NEXT_QUIZ_SLOT = text(
    """
    select starts_at
      from public.schedule_slots
     where formation_id = cast(:formation_id as uuid)
       and kind = 'global_quiz'
       and status = 'planned'
       and starts_at > cast(:now as timestamptz)
       and (starts_at at time zone :timezone)::date > cast(:day as date)
     order by starts_at asc
     limit 1
    """
)

LOCK_QUIZ_SESSION = text("select pg_advisory_xact_lock(hashtextextended(:lock_key, 0))")
LOCK_LEARNING_USER = text("select pg_advisory_xact_lock(hashtextextended(:lock_key, 0))")

READ_QUIZ_ANSWER_ACTIVITY = text(
    """
    select a.id::text as id,
           a.owner_id::text as owner_id,
           a.items,
           a.config,
           a.formation_id::text as formation_id,
           at.id::text as attempt_id,
           at.status::text as attempt_status,
           at.attempt_no
      from public.activities a
      join public.attempts at on at.activity_id = a.id
     where a.id = cast(:activity_id as uuid)
     order by at.attempt_no desc
     limit 1
    """
)

READ_REPLAY_ANSWER = text(
    """
    select id::text as id, feedback, response, is_correct, position
      from public.answers
     where attempt_id = cast(:attempt_id as uuid)
       and feedback ->> 'clientAnswerId' = :client_answer_id
     limit 1
    """
)

READ_POSITION_ANSWER = text(
    """
    select id::text as id
      from public.answers
     where attempt_id = cast(:attempt_id as uuid)
       and position = :position
     limit 1
    """
)

READ_ANSWER_BRICK = text(
    """
    select b.type::text as type, bv.payload, b.notion_ids::text[] as notion_ids
      from public.brick_versions bv
      join public.bricks b on b.id = bv.brick_id
     where bv.id = cast(:version_id as uuid)
    """
)

INSERT_REVIEW_ANSWER = text(
    """
    insert into public.answers
      (id, attempt_id, brick_version_id, position, response, is_correct, score, max_score, time_ms,
       graded_by, feedback, answered_at)
    values (
      cast(:answer_id as uuid),
      cast(:attempt_id as uuid),
      cast(:version_id as uuid),
      :position,
      cast(:response as jsonb),
      :is_correct,
      :score,
      :max_score,
      :time_ms,
      'code',
      cast(:feedback as jsonb),
      cast(:answered_at as timestamptz)
    )
    """
)

READ_ANSWER_LOGS = text(
    """
    select rl.notion_id::text as notion_id,
           rl.grade::text as grade,
           ns.due_at::text as due_at
      from public.review_logs rl
      join public.notion_states ns on ns.notion_id = rl.notion_id and ns.user_id = rl.user_id
     where rl.user_id = cast(:user_id as uuid)
       and rl.answer_id = cast(:answer_id as uuid)
     order by rl.notion_id
    """
)

CONSUME_QUIZ_ITEM_ACTION = text(
    """
    update public.automation_actions
       set status = 'consumed'
     where id = cast(:action_id as uuid)
       and user_id = cast(:user_id as uuid)
       and automation in ('jeu_lacune', :question_card_automation)
       and status = 'applied'
    """
)


async def read_quiz_formation(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any] | None:
    """The formation of the learner (owner or active member), with its status."""
    result = await tx.conn.execute(READ_QUIZ_FORMATION, {"user_id": user_id, "formation_id": formation_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_quiz_due_rows(
    tx: Tx, user_id: str, formation_id: str, day_end: str
) -> list[Mapping[str, Any]]:
    """Every due notion state of the day, the count the note displays included."""
    result = await tx.conn.execute(
        READ_QUIZ_DUE_ROWS, {"user_id": user_id, "formation_id": formation_id, "day_end": day_end}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_quiz_active_bricks(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """The active review and bank bricks of the formation, with their current version."""
    result = await tx.conn.execute(
        READ_QUIZ_ACTIVE_BRICKS, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_quiz_last_formats(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """The 20 most recent answers of the formation, for the format variation."""
    result = await tx.conn.execute(READ_QUIZ_LAST_FORMATS, {"user_id": user_id, "formation_id": formation_id})
    return [row_of(item) for item in result.mappings().all()]


async def read_quiz_automation_params(tx: Tx, user_id: str) -> list[Mapping[str, Any]]:
    """The three automation settings the daily session reads."""
    result = await tx.conn.execute(READ_QUIZ_AUTOMATION_PARAMS, {"user_id": user_id})
    return [row_of(item) for item in result.mappings().all()]


async def read_quiz_smoothing_actions(tx: Tx, user_id: str, formation_id: str) -> list[Mapping[str, Any]]:
    """The `quiz_smoothed` actions of the formation, newest first."""
    result = await tx.conn.execute(
        READ_QUIZ_SMOOTHING_ACTIONS, {"user_id": user_id, "formation_id": formation_id}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_quiz_forced_actions(
    tx: Tx,
    user_id: str,
    formation_id: str,
    *,
    question_card_automation: str,
    question_card_kind: str,
) -> list[Mapping[str, Any]]:
    """The applied actions imposing a format on the next quiz (SPEC-716, SPEC-717)."""
    result = await tx.conn.execute(
        READ_QUIZ_FORCED_ACTIONS,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "question_card_automation": question_card_automation,
            "question_card_kind": question_card_kind,
        },
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_quiz_seen_fingerprints(tx: Tx, user_id: str) -> set[str]:
    """The brick variants the learner already answered (BR-MEM-07)."""
    result = await tx.conn.execute(READ_QUIZ_SEEN_FINGERPRINTS, {"user_id": user_id})
    return {str(item["fingerprint"]) for item in result.mappings().all()}


async def read_quiz_today_activity(
    tx: Tx, user_id: str, formation_id: str, today: str, mode: str
) -> Mapping[str, Any] | None:
    """The session of the day for one mode, with its latest attempt."""
    result = await tx.conn.execute(
        READ_QUIZ_TODAY_ACTIVITY,
        {"user_id": user_id, "formation_id": formation_id, "today": today, "mode": mode},
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_quiz_stale_sessions(tx: Tx, user_id: str, today: str) -> list[Mapping[str, Any]]:
    """CL-2 - the sessions left in progress on a previous local day."""
    result = await tx.conn.execute(READ_QUIZ_STALE_SESSIONS, {"user_id": user_id, "today": today})
    return [row_of(item) for item in result.mappings().all()]


async def read_quiz_attempt_for_closure(tx: Tx, user_id: str, attempt_id: str) -> Mapping[str, Any] | None:
    """The locked activity of one in-progress review attempt (EF-10)."""
    result = await tx.conn.execute(
        READ_QUIZ_ATTEMPT_FOR_CLOSURE, {"user_id": user_id, "attempt_id": attempt_id}
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_attempt_positions(tx: Tx, attempt_id: str) -> set[int]:
    """The positions already answered by one attempt."""
    result = await tx.conn.execute(READ_ATTEMPT_POSITIONS, {"attempt_id": attempt_id})
    return {int(item["position"]) for item in result.mappings().all()}


async def insert_skipped_answer(
    tx: Tx,
    *,
    attempt_id: str,
    brick_version_id: str,
    position: int,
    response: str,
    feedback: str,
    answered_at: str,
) -> None:
    """Records the skipped answer of an untraited item at closure."""
    await tx.conn.execute(
        INSERT_SKIPPED_ANSWER,
        {
            "attempt_id": attempt_id,
            "brick_version_id": brick_version_id,
            "position": position,
            "response": response,
            "feedback": feedback,
            "answered_at": answered_at,
        },
    )


async def close_stale_attempt(tx: Tx, attempt_id: str, now: str, now_ms: int) -> None:
    """CL-2 - the previous day's attempt becomes `abandoned` with its duration."""
    await tx.conn.execute(CLOSE_STALE_ATTEMPT, {"attempt_id": attempt_id, "now": now, "now_ms": now_ms})


async def install_quiz_activity(
    tx: Tx,
    *,
    activity_id: str,
    user_id: str,
    formation_id: str,
    config: str,
    items: str,
    today: str,
    created_at: str,
) -> None:
    """Creates the activity of the day under the consultative lock."""
    await tx.conn.execute(
        INSTALL_QUIZ_ACTIVITY,
        {
            "activity_id": activity_id,
            "user_id": user_id,
            "formation_id": formation_id,
            "config": config,
            "items": items,
            "today": today,
            "created_at": created_at,
        },
    )


async def install_quiz_attempt(
    tx: Tx, *, attempt_id: str, user_id: str, activity_id: str, created_at: str
) -> None:
    """Creates the first attempt of the session."""
    await tx.conn.execute(
        INSTALL_QUIZ_ATTEMPT,
        {
            "attempt_id": attempt_id,
            "user_id": user_id,
            "activity_id": activity_id,
            "created_at": created_at,
        },
    )


async def read_session_bricks(tx: Tx, version_ids: list[str]) -> list[Mapping[str, Any]]:
    """The exact brick versions of the session, in one read (ET-11)."""
    import json

    if not version_ids:
        return []
    result = await tx.conn.execute(READ_SESSION_BRICKS, {"version_ids": json.dumps(version_ids)})
    return [row_of(item) for item in result.mappings().all()]


async def read_session_answers(tx: Tx, attempt_id: str) -> list[Mapping[str, Any]]:
    """The recorded answers of the attempt, by position."""
    result = await tx.conn.execute(READ_SESSION_ANSWERS, {"attempt_id": attempt_id})
    return [row_of(item) for item in result.mappings().all()]


async def read_session_notions(tx: Tx, notion_ids: list[str]) -> list[Mapping[str, Any]]:
    """The labels and module positions of the session notions."""
    import json

    if not notion_ids:
        return []
    result = await tx.conn.execute(READ_SESSION_NOTIONS, {"notion_ids": json.dumps(notion_ids)})
    return [row_of(item) for item in result.mappings().all()]


async def read_session_cards(tx: Tx, user_id: str, notion_ids: list[str]) -> list[Mapping[str, Any]]:
    """The FSRS cards of the recall-card notions, for the interval previews (EF-9)."""
    import json

    if not notion_ids:
        return []
    result = await tx.conn.execute(
        READ_SESSION_CARDS, {"user_id": user_id, "notion_ids": json.dumps(notion_ids)}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_answer_outcomes(tx: Tx, user_id: str, attempt_id: str) -> list[Mapping[str, Any]]:
    """The FSRS outcomes of one attempt's answers, one query."""
    result = await tx.conn.execute(READ_ANSWER_OUTCOMES, {"user_id": user_id, "attempt_id": attempt_id})
    return [row_of(item) for item in result.mappings().all()]


async def update_session_item_flags(
    tx: Tx, *, activity_id: str, position: int, withdrawn: bool, invalid: bool
) -> None:
    """ET-6, CL-7 - persists the `withdrawn` and `invalid` flags of one session item."""
    import json

    await tx.conn.execute(
        UPDATE_SESSION_ITEM_FLAGS,
        {
            "activity_id": activity_id,
            "position_text": str(position),
            "withdrawn": json.dumps(withdrawn),
            "invalid": json.dumps(invalid),
        },
    )


async def retire_brick(tx: Tx, brick_id: str) -> None:
    """CL-7 - a stored payload that no longer matches its schema retires the brick."""
    await tx.conn.execute(RETIRE_BRICK, {"brick_id": brick_id})


async def read_mode_options(tx: Tx, user_id: str, formation_id: str, today: str) -> list[Mapping[str, Any]]:
    """The configs of the day's sessions, for the two-mode switch durations."""
    result = await tx.conn.execute(
        READ_MODE_OPTIONS, {"user_id": user_id, "formation_id": formation_id, "today": today}
    )
    return [row_of(item) for item in result.mappings().all()]


async def read_quiz_activity_for_update(tx: Tx, activity_id: str) -> Mapping[str, Any] | None:
    """The locked session row of a closure."""
    result = await tx.conn.execute(READ_QUIZ_ACTIVITY_FOR_UPDATE, {"activity_id": activity_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_latest_attempt(tx: Tx, activity_id: str) -> Mapping[str, Any] | None:
    """The latest attempt of one activity."""
    result = await tx.conn.execute(READ_LATEST_ATTEMPT, {"activity_id": activity_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_attempt_answer_rows(tx: Tx, attempt_id: str) -> list[Mapping[str, Any]]:
    """The answers of the attempt, for the end-screen summary (EF-11)."""
    result = await tx.conn.execute(READ_ATTEMPT_ANSWER_ROWS, {"attempt_id": attempt_id})
    return [row_of(item) for item in result.mappings().all()]


async def mark_attempt_graded(
    tx: Tx, *, attempt_id: str, submitted_at: str, duration_ms: int, score: int | None
) -> None:
    """Closes the attempt with its duration and its score."""
    await tx.conn.execute(
        MARK_ATTEMPT_GRADED,
        {
            "attempt_id": attempt_id,
            "submitted_at": submitted_at,
            "duration_ms": duration_ms,
            "score": None if score is None else str(score),
        },
    )


async def store_attempt_summary(tx: Tx, attempt_id: str, review_feedback: str) -> None:
    """Freezes the summary of a closed session for the idempotent replays (EF-11)."""
    await tx.conn.execute(
        STORE_ATTEMPT_SUMMARY, {"attempt_id": attempt_id, "review_feedback": review_feedback}
    )


async def read_profile_streak_for_update(tx: Tx, user_id: str) -> Mapping[str, Any] | None:
    """The locked streak counters of the profile."""
    result = await tx.conn.execute(READ_PROFILE_STREAK_FOR_UPDATE, {"user_id": user_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_yesterday_qualifying(tx: Tx, user_id: str, yesterday: str) -> bool:
    """Whether the previous local day qualified, which extends the streak."""
    result = await tx.conn.execute(READ_YESTERDAY_QUALIFYING, {"user_id": user_id, "yesterday": yesterday})
    found = result.mappings().first()
    return found is not None and bool(found["qualifying"])


async def update_profile_streak(tx: Tx, user_id: str, streak: int, day: str) -> None:
    """Stores the streak and marks the day as counted."""
    await tx.conn.execute(UPDATE_PROFILE_STREAK, {"user_id": user_id, "streak": streak, "day": day})


async def read_profile_streak(tx: Tx, user_id: str) -> int:
    """The stored streak, zero when the profile has none."""
    result = await tx.conn.execute(READ_PROFILE_STREAK, {"user_id": user_id})
    found = result.mappings().first()
    return 0 if found is None else int(found["streak_days"])


async def complete_quiz_slots(
    tx: Tx, *, user_id: str, formation_id: str, day: str, timezone: str, now: str
) -> None:
    """QA SCR-03 - the finished full session closes the global-quiz slot of the day."""
    await tx.conn.execute(
        COMPLETE_QUIZ_SLOTS,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "day": day,
            "timezone": timezone,
            "now": now,
        },
    )


async def read_next_quiz_slot(tx: Tx, formation_id: str, now: str, day: str, timezone: str) -> str | None:
    """The first planned global-quiz slot after the closure (EF-11)."""
    result = await tx.conn.execute(
        READ_NEXT_QUIZ_SLOT,
        {"formation_id": formation_id, "now": now, "day": day, "timezone": timezone},
    )
    found = result.mappings().first()
    return None if found is None else str(found["starts_at"])


async def lock_quiz_session(tx: Tx, lock_key: str) -> None:
    """The consultative lock of one `(learner, formation, day, mode)` session."""
    await tx.conn.execute(LOCK_QUIZ_SESSION, {"lock_key": lock_key})


async def lock_learning_user(tx: Tx, user_id: str) -> None:
    """The advisory lock serialising the journal application of one learner."""
    await tx.conn.execute(LOCK_LEARNING_USER, {"lock_key": f"learning:{user_id}"})


async def read_quiz_answer_activity(tx: Tx, activity_id: str) -> Mapping[str, Any] | None:
    """The session and its latest attempt, for one answer."""
    result = await tx.conn.execute(READ_QUIZ_ANSWER_ACTIVITY, {"activity_id": activity_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_replay_answer(tx: Tx, attempt_id: str, client_answer_id: str) -> Mapping[str, Any] | None:
    """CL-5 - the answer recorded for this `clientAnswerId`, if any."""
    result = await tx.conn.execute(
        READ_REPLAY_ANSWER, {"attempt_id": attempt_id, "client_answer_id": client_answer_id}
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_position_answer(tx: Tx, attempt_id: str, position: int) -> str | None:
    """The identifier of an answer already stored at this position (409)."""
    result = await tx.conn.execute(READ_POSITION_ANSWER, {"attempt_id": attempt_id, "position": position})
    found = result.mappings().first()
    return None if found is None else str(found["id"])


async def read_answer_brick(tx: Tx, version_id: str) -> Mapping[str, Any] | None:
    """The type, payload and notions of the answered brick version."""
    result = await tx.conn.execute(READ_ANSWER_BRICK, {"version_id": version_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def insert_review_answer(
    tx: Tx,
    *,
    answer_id: str,
    attempt_id: str,
    version_id: str,
    position: int,
    response: str,
    is_correct: bool | None,
    score: float | int | None,
    max_score: float | int | None,
    time_ms: float,
    feedback: str,
    answered_at: str,
) -> None:
    """Records one answer of the session with its correction and its feedback."""
    await tx.conn.execute(
        INSERT_REVIEW_ANSWER,
        {
            "answer_id": answer_id,
            "attempt_id": attempt_id,
            "version_id": version_id,
            "position": position,
            "response": response,
            "is_correct": is_correct,
            "score": score,
            "max_score": max_score,
            "time_ms": time_ms,
            "feedback": feedback,
            "answered_at": answered_at,
        },
    )


async def read_answer_logs(tx: Tx, user_id: str, answer_id: str) -> list[Mapping[str, Any]]:
    """The FSRS outcomes of one answer, by notion."""
    result = await tx.conn.execute(READ_ANSWER_LOGS, {"user_id": user_id, "answer_id": answer_id})
    return [row_of(item) for item in result.mappings().all()]


async def consume_quiz_item_action(
    tx: Tx, *, user_id: str, action_id: str, question_card_automation: str
) -> None:
    """SPEC-716 EF-8, SPEC-717 ET-5 - an answered imposed game consumes its action."""
    await tx.conn.execute(
        CONSUME_QUIZ_ITEM_ACTION,
        {
            "user_id": user_id,
            "action_id": action_id,
            "question_card_automation": question_card_automation,
        },
    )


# --------------------------------------------------------------------------------------------------
# warmup/answer.ts (SPEC-714 EF-8, EF-9) - first-pass answer of the daily warm-up
# --------------------------------------------------------------------------------------------------

LOCK_WARMUP_ACTIVITY = text(
    """
    select a.id::text as id,
           a.formation_id::text as formation_id,
           a.module_id::text as module_id,
           m.position as module_position,
           a.config,
           a.items,
           a.status::text as status,
           a.for_date::text as for_date,
           t.id::text as attempt_id,
           t.status::text as attempt_status,
           t.started_at as attempt_started_at,
           t.submitted_at as attempt_submitted_at,
           (
             select ss.starts_at
               from public.schedule_slots ss
              where ss.activity_id = a.id
                and ss.status in ('planned', 'done', 'moved')
              order by ss.starts_at desc
              limit 1
           ) as slot_starts_at,
           (
             select (aa.payload ->> 'reviewRemaining')::boolean
               from public.automation_actions aa
              where aa.user_id = a.owner_id
                and aa.automation = 'echauffement'
                and (aa.payload ->> 'activityId') = a.id::text
              order by aa.created_at desc
              limit 1
           ) as review_remaining
      from public.activities a
      left join public.modules m on m.id = a.module_id
      left join public.attempts t
        on t.activity_id = a.id and t.user_id = a.owner_id and t.attempt_no = 1
     where a.id = cast(:activity_id as uuid)
       and a.owner_id = cast(:user_id as uuid)
       and a.kind = 'warmup'
       for update of a
    """
)

INSERT_WARMUP_ATTEMPT = text(
    """
    insert into public.attempts (
      id, user_id, activity_id, attempt_no, status, started_at, created_at
    ) values (
      cast(:attempt_id as uuid), cast(:user_id as uuid), cast(:activity_id as uuid), 1, 'in_progress',
      cast(:now as timestamptz), cast(:now as timestamptz)
    )
    on conflict (activity_id, user_id, attempt_no) do nothing
    returning id::text as id, started_at
    """
)

READ_WARMUP_ATTEMPT = text(
    """
    select id::text as id, started_at
      from public.attempts
     where activity_id = cast(:activity_id as uuid)
       and user_id = cast(:user_id as uuid)
       and attempt_no = 1
    """
)

READ_WARMUP_ANSWER_POSITIONS = text(
    """
    select position from public.answers where attempt_id = cast(:attempt_id as uuid)
    """
)

READ_WARMUP_ITEM_BRICK = text(
    """
    select b.id::text as brick_id,
           bv.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           n.module_id::text as module_id
      from public.brick_versions bv
      join public.bricks b on b.id = bv.brick_id
      join public.notions n on n.id = b.notion_ids[1]
     where bv.id = cast(:version_id as uuid)
    """
)

INSERT_WARMUP_ANSWER = text(
    """
    insert into public.answers (
      id, attempt_id, brick_version_id, position, response, is_correct,
      score, max_score, time_ms, graded_by, feedback, answered_at
    ) values (
      cast(:answer_id as uuid), cast(:attempt_id as uuid), cast(:version_id as uuid),
      :position, cast(:response as jsonb), :is_correct,
      :score, '1', 0, 'code', null, cast(:answered_at as timestamptz)
    )
    """
)

READ_EVENING_QUIZ = text(
    """
    select a.id::text as id,
           a.config,
           a.items,
           t.id::text as attempt_id,
           (
             select count(*)::int from public.answers an where an.attempt_id = t.id
           ) as answer_count
      from public.activities a
      left join public.attempts t
        on t.activity_id = a.id and t.user_id = a.owner_id and t.attempt_no = 1
     where a.owner_id = cast(:user_id as uuid)
       and a.formation_id = cast(:formation_id as uuid)
       and a.kind = 'global_quiz_session'
       and a.for_date = cast(:today as date)
       and a.status = 'ready'
     order by a.created_at desc
     limit 1
    """
)

READ_QUIZ_BRICK_OF_NOTION = text(
    """
    select b.id::text as brick_id,
           bv.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           n.module_id::text as module_id
      from public.bricks b
      join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
      join public.notions n on n.id = cast(:notion_id as uuid)
     where b.owner_id = cast(:user_id as uuid)
       and b.formation_id = cast(:formation_id as uuid)
       and b.status = 'active'
       and b.notion_ids @> array[cast(:notion_id as uuid)]
     order by (b.type = 'recall_card') desc, b.created_at asc
     limit 1
    """
)

READ_NOTION_LABEL = text(
    """
    select label from public.notions where id = cast(:notion_id as uuid)
    """
)

RESCHEDULE_NOTION = text(
    """
    update public.notion_states
       set due_at = cast(:due_at as timestamptz),
           in_review = true,
           updated_at = cast(:due_at as timestamptz)
     where user_id = cast(:user_id as uuid) and notion_id = cast(:notion_id as uuid)
    """
)

UPDATE_EVENING_QUIZ = text(
    """
    update public.activities
       set config = cast(:config as jsonb),
           items = cast(:items as jsonb)
     where id = cast(:activity_id as uuid)
    """
)

READ_WARMUP_ACTION = text(
    """
    select id::text as id, payload
      from public.automation_actions
     where user_id = cast(:user_id as uuid)
       and automation = 'echauffement'
       and status = 'applied'
       and (payload ->> 'activityId') = :activity_id
     order by created_at desc
     limit 1
    """
)

UPDATE_WARMUP_ACTION_PAYLOAD = text(
    """
    update public.automation_actions
       set payload = cast(:payload as jsonb),
           summary = :summary
     where id = cast(:action_id as uuid) and user_id = cast(:user_id as uuid)
    """
)

COMPLETE_WARMUP_SLOT = text(
    """
    update public.schedule_slots
       set status = 'done', updated_at = cast(:now as timestamptz)
     where id = cast(:slot_id as uuid) and user_id = cast(:user_id as uuid) and status = 'planned'
    """
)


async def lock_warmup_activity(tx: Tx, user_id: str, activity_id: str) -> Mapping[str, Any] | None:
    """The locked warm-up activity of the day, with its first attempt and its action."""
    result = await tx.conn.execute(LOCK_WARMUP_ACTIVITY, {"user_id": user_id, "activity_id": activity_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def ensure_warmup_attempt(tx: Tx, user_id: str, activity_id: str, now: str) -> Mapping[str, Any] | None:
    """The first attempt of the warm-up, created on first answer."""
    import uuid as uuid_module

    result = await tx.conn.execute(
        INSERT_WARMUP_ATTEMPT,
        {
            "attempt_id": str(uuid_module.uuid4()),
            "user_id": user_id,
            "activity_id": activity_id,
            "now": now,
        },
    )
    created = result.mappings().first()
    if created is not None:
        return row_of(created)
    existing = await tx.conn.execute(READ_WARMUP_ATTEMPT, {"user_id": user_id, "activity_id": activity_id})
    found = existing.mappings().first()
    return None if found is None else row_of(found)


async def read_warmup_answer_positions(tx: Tx, attempt_id: str) -> set[int]:
    """The positions already answered in the warm-up attempt."""
    result = await tx.conn.execute(READ_WARMUP_ANSWER_POSITIONS, {"attempt_id": attempt_id})
    return {int(item["position"]) for item in result.mappings().all()}


async def read_warmup_item_brick(tx: Tx, version_id: str) -> Mapping[str, Any] | None:
    """The brick behind one warm-up item, with its first notion and its module."""
    result = await tx.conn.execute(READ_WARMUP_ITEM_BRICK, {"version_id": version_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def insert_warmup_answer(
    tx: Tx,
    *,
    answer_id: str,
    attempt_id: str,
    version_id: str,
    position: int,
    response: str,
    is_correct: bool,
    answered_at: str,
) -> None:
    """Records one first-pass answer of the warm-up (score 1 or 0, no duration)."""
    await tx.conn.execute(
        INSERT_WARMUP_ANSWER,
        {
            "answer_id": answer_id,
            "attempt_id": attempt_id,
            "version_id": version_id,
            "position": position,
            "response": response,
            "is_correct": is_correct,
            "score": "1" if is_correct else "0",
            "answered_at": answered_at,
        },
    )


async def read_evening_quiz(tx: Tx, user_id: str, formation_id: str, today: str) -> Mapping[str, Any] | None:
    """EF-8 - the ready global quiz of the day, with its answer count."""
    result = await tx.conn.execute(
        READ_EVENING_QUIZ,
        {"user_id": user_id, "formation_id": formation_id, "today": today},
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_quiz_brick_of_notion(
    tx: Tx, user_id: str, formation_id: str, notion_id: str
) -> Mapping[str, Any] | None:
    """The recall card preferred brick of one notion in the formation."""
    result = await tx.conn.execute(
        READ_QUIZ_BRICK_OF_NOTION,
        {"user_id": user_id, "formation_id": formation_id, "notion_id": notion_id},
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_notion_label(tx: Tx, notion_id: str) -> str | None:
    """The label of one notion, `None` when it disappeared."""
    result = await tx.conn.execute(READ_NOTION_LABEL, {"notion_id": notion_id})
    found = result.mappings().first()
    return None if found is None else str(found["label"])


async def reschedule_notion(tx: Tx, *, user_id: str, notion_id: str, due_at: str) -> None:
    """EF-8 - the card is due today when the session is not played, tomorrow once it is."""
    await tx.conn.execute(RESCHEDULE_NOTION, {"user_id": user_id, "notion_id": notion_id, "due_at": due_at})


async def update_evening_quiz(tx: Tx, *, activity_id: str, config: str, items: str) -> None:
    """EF-8 - the warm-up notion joins the head of the evening quiz."""
    await tx.conn.execute(UPDATE_EVENING_QUIZ, {"activity_id": activity_id, "config": config, "items": items})


async def read_warmup_action(tx: Tx, user_id: str, activity_id: str) -> Mapping[str, Any] | None:
    """The applied `echauffement` action of one activity, newest first."""
    result = await tx.conn.execute(READ_WARMUP_ACTION, {"user_id": user_id, "activity_id": activity_id})
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def update_warmup_action_payload(
    tx: Tx, *, action_id: str, user_id: str, payload: str, summary: str
) -> None:
    """EF-10 - the consumed action freezes its review notions and its summary line."""
    await tx.conn.execute(
        UPDATE_WARMUP_ACTION_PAYLOAD,
        {"action_id": action_id, "user_id": user_id, "payload": payload, "summary": summary},
    )


async def complete_warmup_slot(tx: Tx, *, user_id: str, slot_id: str, now: str) -> None:
    """The warm-up slot becomes `done` once the first pass is complete."""
    await tx.conn.execute(COMPLETE_WARMUP_SLOT, {"user_id": user_id, "slot_id": slot_id, "now": now})


# --------------------------------------------------------------------------------------------------
# learning/get-due-notions.ts (SPEC-411 EF-3, ET-2) - due notions of one formation
# --------------------------------------------------------------------------------------------------

READ_DUE_NOTIONS = text(
    """
    select
      ns.notion_id::text as notion_id,
      n.label,
      n.chapter_id::text as chapter_id,
      n.module_id::text as module_id,
      m.position as module_position,
      coalesce(mp.status, m.status)::text as module_status,
      (
        mp.best_score is not null
        or exists (
          select 1
          from public.attempts a
          join public.activities act on act.id = a.activity_id
          where a.user_id = ns.user_id
            and act.module_id = n.module_id
            and act.formation_id = n.formation_id
            and a.status in ('graded', 'timed_out')
        )
      ) as evaluated,
      ns.due_at,
      ns.mastery::text as mastery,
      ns.gap_nature::text as gap_nature
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    join public.modules m on m.id = n.module_id
    join public.formations f on f.id = n.formation_id
    left join public.module_progress mp
      on mp.user_id = ns.user_id and mp.module_id = m.id
    where ns.user_id = cast(:user_id as uuid)
      and n.formation_id = cast(:formation_id as uuid)
      and ns.in_review
      and not ns.suspended
      and ns.due_at <= cast(:at as timestamptz)
    order by m.position, ns.due_at, n.position, n.id
    """
)


async def read_due_notions_rows(tx: Tx, user_id: str, formation_id: str, at: str) -> list[Mapping[str, Any]]:
    """EF-3, ET-2 - the due notions of the formation at the given instant."""
    result = await tx.conn.execute(
        READ_DUE_NOTIONS, {"user_id": user_id, "formation_id": formation_id, "at": at}
    )
    return [row_of(item) for item in result.mappings().all()]


# --------------------------------------------------------------------------------------------------
# apply_learning_result
# --------------------------------------------------------------------------------------------------

READ_ATTEMPT_FOR_APPLICATION = text(
    """
    select a.id::text as id,
           a.user_id::text as user_id,
           a.activity_id::text as activity_id,
           a.attempt_no,
           a.status::text as status,
           a.started_at,
           a.submitted_at,
           a.duration_ms,
           act.kind::text as activity_kind,
           act.module_id::text as module_id,
           act.formation_id::text as formation_id,
           act.owner_id::text as owner_id,
           act.config
      from public.attempts a
      join public.activities act on act.id = a.activity_id
     where a.id = cast(:attempt_id as uuid)
       and a.user_id = cast(:user_id as uuid)
     for update of a
    """
)

READ_ATTEMPT_ANSWERS_FOR_APPLICATION = text(
    """
    select a.id::text as id,
           a.attempt_id::text as attempt_id,
           a.position,
           a.brick_version_id::text as brick_version_id,
           b.type::text as brick_type,
           b.notion_ids::text[] as notion_ids,
           a.is_correct,
           a.score::text as score,
           a.max_score::text as max_score,
           a.time_ms,
           a.answered_at,
           a.chosen_distractor_notion_id::text as chosen_distractor_notion_id,
           a.response,
           a.feedback
      from public.answers a
      join public.brick_versions bv on bv.id = a.brick_version_id
      join public.bricks b on b.id = bv.brick_id
     where a.attempt_id = cast(:attempt_id as uuid)
     order by a.position
    """
)


async def read_attempt_for_application(tx: Tx, user_id: str, attempt_id: str) -> Mapping[str, Any] | None:
    """`loadAttemptForUpdate`: the graded attempt and its activity, locked for the application."""
    result = await tx.conn.execute(
        READ_ATTEMPT_FOR_APPLICATION, {"user_id": user_id, "attempt_id": attempt_id}
    )
    found = result.mappings().first()
    return None if found is None else row_of(found)


async def read_attempt_answers_for_application(tx: Tx, attempt_id: str) -> list[Mapping[str, Any]]:
    """`loadAnswers`: every answer of the attempt with the notion identifiers of its brick."""
    result = await tx.conn.execute(READ_ATTEMPT_ANSWERS_FOR_APPLICATION, {"attempt_id": attempt_id})
    return [row_of(row) for row in result.mappings().all()]
