"""Read-only SQL of the home screen (SPEC-603, SPEC-2302).

`${x}` placeholders become bound `:x` parameters; nothing here reads the clock, applies a rule or
writes. The caller opens the learner's transaction, so row-level security limits every row to that
learner.
"""

from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx

READ_PROFILE = text(
    """
    select p.current_formation_id::text as current_formation_id,
           p.timezone,
           (select min(ns.due_at)
              from public.notion_states ns
              join public.notions n on n.id = ns.notion_id
             where ns.user_id = p.id
               and n.formation_id = p.current_formation_id
               and not ns.suspended
               and ns.due_at > cast(:now as timestamptz)) as next_review_at
      from public.profiles p
     where p.id = cast(:user_id as uuid)
    """
)

READ_FORMATIONS = text(
    """
    select f.id::text as id,
           f.title,
           f.monogram,
           f.accent_color::text as accent,
           f.status::text as status,
           f.description,
           f.objectives::text[] as objectives,
           f.volume_hours,
           f.start_date::text as start_date,
           f.end_date::text as end_date,
           f.completed_at,
           f.maintenance_mode::text as maintenance_mode,
           f.last_opened_at,
           f.created_at,
           f.creation_mode::text as creation_mode,
           (select sa.status::text
              from public.simple_analyses sa
             where sa.formation_id = f.id
             limit 1) as simple_status,
           (select count(*)::int from public.modules m where m.formation_id = f.id) as module_count,
           (select count(*)::int
              from public.modules m
              join public.module_progress mp on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
             where m.formation_id = f.id and mp.status = 'validated') as validated_count,
           om.id::text as open_module_id,
           om.position as open_module_position,
           om.title as open_module_title,
           om.threshold as open_module_threshold,
           om.status as open_module_status,
           coalesce(om.contributions_in_progress, false) as contributions_in_progress,
           om.course_status,
           om.reading_percent,
           coalesce(om.attempt_count, 0) as attempt_count,
           om.last_score,
           (select round(avg(mp.best_score))::int
              from public.module_progress mp
              join public.modules m on m.id = mp.module_id
             where mp.user_id = cast(:user_id as uuid)
               and m.formation_id = f.id
               and mp.best_score is not null) as result_percent,
           (select count(*)::int
              from public.notion_states ns
              join public.notions n on n.id = ns.notion_id
             where ns.user_id = cast(:user_id as uuid)
               and n.formation_id = f.id
               and not ns.suspended
               and ns.due_at <= cast(:now as timestamptz)) as due_count,
           (select count(*)::int
              from public.cadrage_messages cm
             where cm.formation_id = f.id and cm.role = 'tutor') as cadrage_questions
      from public.formations f
      left join lateral (
        select m.id,
               m.position,
               m.title,
               m.threshold,
               coalesce(mp.status, m.status)::text as status,
               exists (
                 select 1
                   from public.chapters c
                   join public.chapter_progress cp
                     on cp.chapter_id = c.id and cp.user_id = cast(:user_id as uuid)
                  where c.module_id = m.id and cp.contributions_status = 'in_progress'
               ) as contributions_in_progress,
               (select c.status::text
                  from public.courses c
                 where c.owner_id = cast(:user_id as uuid) and c.module_id = m.id and c.is_current
                 limit 1) as course_status,
               (select min(rp.percent)
                  from public.reading_progress rp
                  join public.courses c on c.id = rp.course_id and c.is_current
                 where rp.user_id = cast(:user_id as uuid) and c.module_id = m.id) as reading_percent,
               (select count(*)::int
                  from public.attempts a
                  join public.activities act on act.id = a.activity_id
                 where a.user_id = cast(:user_id as uuid)
                   and act.module_id = m.id
                   and act.kind = 'validation_quiz') as attempt_count,
               (select a.score::float8
                  from public.attempts a
                  join public.activities act on act.id = a.activity_id
                 where a.user_id = cast(:user_id as uuid)
                   and act.module_id = m.id
                   and act.kind = 'validation_quiz'
                 order by a.attempt_no desc, a.started_at desc
                 limit 1) as last_score
          from public.modules m
          left join public.module_progress mp on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
         where m.formation_id = f.id
           and coalesce(mp.status, m.status) = 'open'
         order by m.position
         limit 1
      ) om on true
     where f.status <> 'archived'
       and (f.owner_id = cast(:user_id as uuid)
            or exists (
              select 1
                from public.groups g
                join public.group_members gm on gm.group_id = g.id
               where g.formation_id = f.id
                 and gm.user_id = cast(:user_id as uuid)
                 and gm.member_status = 'active'
                 and gm.left_at is null))
     order by f.created_at asc
    """
)

READ_TODAY_SLOTS = text(
    """
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.activity_id::text as activity_id,
           ss.kind::text as kind,
           ss.title,
           ss.meta,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status
      from public.schedule_slots ss
     where ss.user_id = cast(:user_id as uuid)
       and ss.starts_at >= cast(:day_start as timestamptz)
       and ss.starts_at < cast(:day_end as timestamptz)
       and ss.status in ('planned', 'done', 'missed')
     order by ss.starts_at, ss.id
    """
)

READ_NEXT_SLOTS = text(
    """
    select distinct on (ss.formation_id)
           ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.activity_id::text as activity_id,
           ss.kind::text as kind,
           ss.title,
           ss.meta,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status
      from public.schedule_slots ss
     where ss.user_id = cast(:user_id as uuid)
       and ss.status = 'planned'
       and ss.starts_at >= cast(:now as timestamptz)
     order by ss.formation_id, ss.starts_at
    """
)

READ_RETENTION_MODULES = text(
    """
    select m.formation_id::text as formation_id,
           m.id::text as module_id,
           mp.validated_at,
           coalesce(array_agg(n.id::text) filter (where n.id is not null), '{}') as notion_ids
      from public.modules m
      join public.module_progress mp on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
      left join public.notions n on n.module_id = m.id
     where mp.status = 'validated' and mp.validated_at is not null
     group by m.formation_id, m.id, mp.validated_at
    """
)

READ_RETENTION_REVIEWS = text(
    """
    select rl.id::text as review_id,
           rl.notion_id::text as notion_id,
           rl.reviewed_at,
           coalesce(rl.correct, false) as correct
      from public.review_logs rl
      join public.notions n on n.id = rl.notion_id
     where rl.user_id = cast(:user_id as uuid)
    """
)

READ_DUE_NOTIONS = text(
    """
    select n.id::text as notion_id,
           n.module_id::text as module_id,
           m.position as module_position,
           coalesce(mp.status, m.status)::text as module_status,
           (mp.best_score is not null
            or exists (
              select 1
                from public.attempts a
                join public.activities act on act.id = a.activity_id
               where a.user_id = ns.user_id
                 and act.module_id = n.module_id
                 and a.status in ('graded', 'timed_out'))) as evaluated,
           ns.due_at,
           ns.in_review,
           ns.gap_nature::text as gap_nature
      from public.notion_states ns
      join public.notions n on n.id = ns.notion_id
      join public.modules m on m.id = n.module_id
      left join public.module_progress mp on mp.module_id = m.id and mp.user_id = ns.user_id
     where ns.user_id = cast(:user_id as uuid)
       and n.formation_id = cast(:formation_id as uuid)
       and not ns.suspended
       and ns.due_at <= cast(:now as timestamptz)
     order by m.position, ns.due_at, n.position, n.id
    """
)

READ_BRICKS = text(
    """
    select b.notion_ids::text[] as notion_ids, b.type::text as type
      from public.bricks b
     where b.owner_id = cast(:user_id as uuid)
       and b.formation_id = cast(:formation_id as uuid)
       and b.status = 'active'
    """
)

READ_NEXT_QUIZ_START = text(
    """
    select starts_at
      from public.schedule_slots
     where user_id = cast(:user_id as uuid)
       and formation_id = cast(:formation_id as uuid)
       and kind = 'global_quiz'
       and status = 'planned'
       and (starts_at at time zone :time_zone)::date > cast(:today as date)
     order by starts_at
     limit 1
    """
)

READ_TODAY_QUIZ_CARD = text(
    """
    select a.config,
           exists (
             select 1 from public.attempts at
              where at.activity_id = a.id and at.status = 'graded'
           ) as completed
      from public.activities a
     where a.owner_id = cast(:user_id as uuid)
       and a.formation_id = cast(:formation_id as uuid)
       and a.kind = 'global_quiz_session'
       and a.for_date = cast(:today as date)
     order by a.created_at desc
     limit 1
    """
)

READ_QUIZ_CAP_PARAMS = text(
    """
    select params from public.automation_settings
     where user_id = cast(:user_id as uuid) and key = 'plafond_quiz'
     limit 1
    """
)


async def read_profile(tx: Tx, user_id: str, now: str) -> dict[str, Any] | None:
    """`readProfile`: the learner's zone, current formation and next review instant."""
    result = await tx.conn.execute(READ_PROFILE, {"user_id": user_id, "now": now})
    found = result.mappings().all()
    return None if not found else dict(found[0])


async def read_formations(tx: Tx, user_id: str, now: str) -> list[dict[str, Any]]:
    """`readFormations`: every visible formation with the open module of its first open position."""
    result = await tx.conn.execute(READ_FORMATIONS, {"user_id": user_id, "now": now})
    return [dict(row) for row in result.mappings().all()]


async def read_today_slots(tx: Tx, user_id: str, day_start: str, day_end: str) -> list[dict[str, Any]]:
    """`readTodaySlots`: the half-open window `[day_start, day_end)` of the learner's day."""
    result = await tx.conn.execute(
        READ_TODAY_SLOTS,
        {"user_id": user_id, "day_start": day_start, "day_end": day_end},
    )
    return [dict(row) for row in result.mappings().all()]


async def read_next_slots(tx: Tx, user_id: str, now: str) -> list[dict[str, Any]]:
    """`readNextSlots`: the next planned slot of each formation."""
    result = await tx.conn.execute(READ_NEXT_SLOTS, {"user_id": user_id, "now": now})
    return [dict(row) for row in result.mappings().all()]


async def read_retention(tx: Tx, user_id: str) -> dict[str, list[dict[str, Any]]]:
    """`readRetention`: validated modules with their notions, and every review of the learner."""
    modules = await tx.conn.execute(READ_RETENTION_MODULES, {"user_id": user_id})
    reviews = await tx.conn.execute(READ_RETENTION_REVIEWS, {"user_id": user_id})
    return {
        "modules": [dict(row) for row in modules.mappings().all()],
        "reviews": [dict(row) for row in reviews.mappings().all()],
    }


async def read_due_notions(tx: Tx, user_id: str, formation_id: str, now: str) -> list[dict[str, Any]]:
    """`readDueNotions`: every due notion of one formation, bound eager first."""
    result = await tx.conn.execute(
        READ_DUE_NOTIONS,
        {"user_id": user_id, "formation_id": formation_id, "now": now},
    )
    return [dict(row) for row in result.mappings().all()]


async def read_bricks(tx: Tx, user_id: str, formation_id: str) -> list[dict[str, Any]]:
    """`readBricks`: the active bricks of one formation, source of the quiz formats."""
    result = await tx.conn.execute(READ_BRICKS, {"user_id": user_id, "formation_id": formation_id})
    return [dict(row) for row in result.mappings().all()]


async def read_next_quiz_start(
    tx: Tx, user_id: str, formation_id: str, today: str, time_zone: str
) -> Any | None:
    """`readNextQuizDay` raw read: start of the next planned global quiz after today."""
    result = await tx.conn.execute(
        READ_NEXT_QUIZ_START,
        {"user_id": user_id, "formation_id": formation_id, "today": today, "time_zone": time_zone},
    )
    found = result.mappings().all()
    return None if not found else found[0]["starts_at"]


async def read_today_quiz_card(tx: Tx, user_id: str, formation_id: str, today: str) -> dict[str, Any] | None:
    """`readTodayQuizCard` raw read: the stored session of the day, with its graded flag."""
    result = await tx.conn.execute(
        READ_TODAY_QUIZ_CARD,
        {"user_id": user_id, "formation_id": formation_id, "today": today},
    )
    found = result.mappings().all()
    return None if not found else dict(found[0])


async def read_quiz_cap_params(tx: Tx, user_id: str) -> dict[str, Any]:
    """`readQuizCapMinutes` raw read: the `plafond_quiz` automation parameters, empty when unset."""
    result = await tx.conn.execute(READ_QUIZ_CAP_PARAMS, {"user_id": user_id})
    found = result.mappings().all()
    if not found or found[0]["params"] is None:
        return {}
    params = found[0]["params"]
    return dict(params) if isinstance(params, dict) else {}
