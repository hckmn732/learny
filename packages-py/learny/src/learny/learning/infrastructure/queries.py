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
