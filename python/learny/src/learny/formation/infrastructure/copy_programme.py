"""Individual copy of a shared programme (SPEC-724 EF-4, ET-5; BR-APP-03, ADR-0035).

When a member leaves or is removed, the programme entities are copied as new rows owned by the
member and every personal row of that member is *moved* to the copied entities. Another learner's
rows are never selected.
"""

import json
from datetime import datetime
from typing import Any

from sqlalchemy import text

from learny.formation.infrastructure.queries import row_of
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    FORMATION_COPY_MISSING,
    FORMATION_NOT_FOUND,
    FORMATION_ONLY_ACTIVE_COPY,
)

READ_SOURCE_FORMATION = text(
    """
    select title, status::text as status
      from public.formations
     where id = cast(:formation_id as uuid)
    """
)

INSERT_COPY = text(
    """
    insert into public.formations (
      owner_id, title, monogram, accent_color, description, objectives, status,
      cadrage_profile, volume_hours, start_date, end_date, study_override, default_threshold,
      exam_format, course_language, last_opened_at, created_at, updated_at
    )
    select cast(:user_id as uuid), title, monogram, accent_color, description, objectives, 'active',
           cadrage_profile, volume_hours, start_date, end_date, study_override, default_threshold,
           exam_format, course_language, cast(:now as timestamptz), cast(:now as timestamptz),
           cast(:now as timestamptz)
      from public.formations
     where id = cast(:source_id as uuid)
    returning id::text as id
    """
)

COPY_MODULES = text(
    """
    insert into public.modules (
      formation_id, position, title, objectives, planned_start, planned_end, threshold,
      status, created_at, updated_at
    )
    select cast(:formation_id as uuid), position, title, objectives, planned_start, planned_end,
           threshold, 'locked'::public.module_status, cast(:now as timestamptz),
           cast(:now as timestamptz)
      from public.modules
     where formation_id = cast(:source_id as uuid)
     order by position
    """
)

COPY_CHAPTERS = text(
    """
    insert into public.chapters (
      module_id, formation_id, position, title, created_at, updated_at
    )
    select nm.id, cast(:formation_id as uuid), c.position, c.title,
           cast(:now as timestamptz), cast(:now as timestamptz)
      from public.chapters c
      join public.modules om on om.id = c.module_id and om.formation_id = cast(:source_id as uuid)
      join public.modules nm
        on nm.formation_id = cast(:formation_id as uuid) and nm.position = om.position
    """
)

COPY_NOTIONS = text(
    """
    insert into public.notions (
      formation_id, module_id, chapter_id, label, short_definition, position, created_by,
      created_at, updated_at
    )
    select cast(:formation_id as uuid), nm.id, nc.id, n.label, n.short_definition, n.position,
           n.created_by, cast(:now as timestamptz), cast(:now as timestamptz)
      from public.notions n
      join public.modules om on om.id = n.module_id and om.formation_id = cast(:source_id as uuid)
      join public.chapters oc on oc.id = n.chapter_id
      join public.modules nm
        on nm.formation_id = cast(:formation_id as uuid) and nm.position = om.position
      join public.chapters nc on nc.module_id = nm.id and nc.position = oc.position
    """
)

READ_OLD_MODULES = text(
    """
    select om.id::text as id, om.position
      from public.modules om
     where om.formation_id = cast(:formation_id as uuid)
     order by om.position
    """
)


def _pairs(values: list[tuple[str, str]], prefix: str) -> tuple[str, dict[str, Any]]:
    """A `values` list of `(old_id, new_id)` pairs, every identifier bound as a parameter."""
    fragments: list[str] = []
    parameters: dict[str, Any] = {}
    for index, (old_id, new_id) in enumerate(values):
        fragments.append(f"(cast(:{prefix}_{index}_old as uuid), cast(:{prefix}_{index}_new as uuid))")
        parameters[f"{prefix}_{index}_old"] = old_id
        parameters[f"{prefix}_{index}_new"] = new_id
    return ", ".join(fragments), parameters


async def copy_programme_for_member(tx: Tx, source_formation_id: str, user_id: str, now: datetime) -> str:
    """EF-4, ET-5 - the individual copy, returned once every personal row has moved."""
    source_result = await tx.conn.execute(READ_SOURCE_FORMATION, {"formation_id": source_formation_id})
    found = source_result.mappings().all()
    if not found:
        raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
    source = row_of(found[0])
    if source["status"] not in ("active", "paused"):
        raise AppError("CONFLICT", FORMATION_ONLY_ACTIVE_COPY)

    copied = await tx.conn.execute(
        INSERT_COPY, {"user_id": user_id, "source_id": source_formation_id, "now": now}
    )
    rows = copied.mappings().all()
    if not rows:
        raise AppError("INTERNAL_ERROR", FORMATION_COPY_MISSING)
    formation_id = str(row_of(rows[0])["id"])

    await tx.conn.execute(
        COPY_MODULES, {"formation_id": formation_id, "source_id": source_formation_id, "now": now}
    )
    await tx.conn.execute(
        COPY_CHAPTERS, {"formation_id": formation_id, "source_id": source_formation_id, "now": now}
    )
    await tx.conn.execute(
        COPY_NOTIONS, {"formation_id": formation_id, "source_id": source_formation_id, "now": now}
    )

    old_modules = await tx.conn.execute(READ_OLD_MODULES, {"formation_id": source_formation_id})
    new_modules = await tx.conn.execute(READ_OLD_MODULES, {"formation_id": formation_id})
    by_position = {
        int(row_of(item)["position"]): str(row_of(item)["id"]) for item in new_modules.mappings().all()
    }
    module_pairs: list[tuple[str, str]] = []
    for item in old_modules.mappings().all():
        row = row_of(item)
        next_id = by_position.get(int(row["position"]))
        if next_id is not None:
            module_pairs.append((str(row["id"]), next_id))

    notion_rows = await tx.conn.execute(
        text(
            """
            select old_notion.id::text as old_id, new_notion.id::text as new_id
              from public.notions old_notion
              join public.modules om
                on om.id = old_notion.module_id and om.formation_id = cast(:source_id as uuid)
              join public.chapters oc on oc.id = old_notion.chapter_id
              join public.modules nm
                on nm.formation_id = cast(:formation_id as uuid) and nm.position = om.position
              join public.chapters nc on nc.module_id = nm.id and nc.position = oc.position
              join public.notions new_notion
                on new_notion.chapter_id = nc.id and new_notion.position = old_notion.position
            """
        ),
        {"formation_id": formation_id, "source_id": source_formation_id},
    )
    notion_pairs = [
        (str(row_of(item)["old_id"]), str(row_of(item)["new_id"])) for item in notion_rows.mappings().all()
    ]

    chapter_rows = await tx.conn.execute(
        text(
            """
            select oc.id::text as old_id, nc.id::text as new_id
              from public.chapters oc
              join public.modules om on om.id = oc.module_id and om.formation_id = cast(:source_id as uuid)
              join public.modules nm
                on nm.formation_id = cast(:formation_id as uuid) and nm.position = om.position
              join public.chapters nc on nc.module_id = nm.id and nc.position = oc.position
            """
        ),
        {"formation_id": formation_id, "source_id": source_formation_id},
    )
    chapter_pairs = [
        (str(row_of(item)["old_id"]), str(row_of(item)["new_id"])) for item in chapter_rows.mappings().all()
    ]

    now_param = {
        "now": now,
        "formation_id": formation_id,
        "user_id": user_id,
        "source_id": source_formation_id,
    }

    if notion_pairs:
        values, parameters = _pairs(notion_pairs, "np")
        await tx.conn.execute(
            text(
                "with map(old_id, new_id) as (values "
                + values
                + """
                )
                insert into public.notion_links (
                  formation_id, from_notion_id, to_notion_id, kind, owner_id, rationale, created_at
                )
                select cast(:formation_id as uuid),
                       (select new_id from map where map.old_id = l.from_notion_id),
                       (select new_id from map where map.old_id = l.to_notion_id),
                       l.kind, l.owner_id, l.rationale, cast(:now as timestamptz)
                  from public.notion_links l
                 where l.formation_id = cast(:source_id as uuid)
                   and (l.owner_id is null or l.owner_id = cast(:user_id as uuid))
                   and exists (select 1 from map where map.old_id = l.from_notion_id)
                   and exists (select 1 from map where map.old_id = l.to_notion_id)
                """
            ),
            {**now_param, **parameters},
        )

    if module_pairs:
        values, parameters = _pairs(module_pairs, "mp")
        for statement in (
            "with map(old_id, new_id) as (values "
            + values
            + """
            )
            update public.module_progress mp
               set module_id = map.new_id,
                   updated_at = cast(:now as timestamptz)
              from map
             where mp.user_id = cast(:user_id as uuid) and mp.module_id = map.old_id
            """,
            "with map(old_id, new_id) as (values "
            + values
            + """
            )
            update public.courses c
               set formation_id = cast(:formation_id as uuid),
                   module_id = map.new_id,
                   updated_at = cast(:now as timestamptz)
              from map
             where c.owner_id = cast(:user_id as uuid)
               and c.formation_id = cast(:source_id as uuid)
               and c.module_id = map.old_id
            """,
            "with map(old_id, new_id) as (values "
            + values
            + """
            )
            update public.schedule_slots s
               set formation_id = cast(:formation_id as uuid),
                   module_id = map.new_id,
                   group_milestone = false,
                   updated_at = cast(:now as timestamptz)
              from map
             where s.user_id = cast(:user_id as uuid)
               and s.formation_id = cast(:source_id as uuid)
               and s.module_id = map.old_id
            """,
            """
            update public.schedule_slots
               set formation_id = cast(:formation_id as uuid),
                   group_milestone = false,
                   updated_at = cast(:now as timestamptz)
             where user_id = cast(:user_id as uuid)
               and formation_id = cast(:source_id as uuid)
               and module_id is null
            """,
            "with map(old_id, new_id) as (values "
            + values
            + """
            )
            update public.activities a
               set formation_id = cast(:formation_id as uuid),
                   module_id = map.new_id
              from map
             where a.owner_id = cast(:user_id as uuid)
               and a.formation_id = cast(:source_id as uuid)
               and a.module_id = map.old_id
            """,
            """
            update public.activities
               set formation_id = cast(:formation_id as uuid)
             where owner_id = cast(:user_id as uuid)
               and formation_id = cast(:source_id as uuid)
               and module_id is null
            """,
            """
            update public.notifications
               set formation_id = cast(:formation_id as uuid),
                   href = replace(href, cast(:source_id as text), cast(:formation_id as text))
             where user_id = cast(:user_id as uuid)
               and formation_id = cast(:source_id as uuid)
            """,
            """
            update public.automation_actions
               set formation_id = cast(:formation_id as uuid)
             where user_id = cast(:user_id as uuid)
               and formation_id = cast(:source_id as uuid)
            """,
        ):
            await tx.conn.execute(text(statement), {**now_param, **parameters})

    if chapter_pairs:
        values, parameters = _pairs(chapter_pairs, "cp")
        for statement in (
            "with map(old_id, new_id) as (values "
            + values
            + """
            )
            update public.chapter_progress cp
               set chapter_id = map.new_id,
                   updated_at = cast(:now as timestamptz)
              from map
             where cp.user_id = cast(:user_id as uuid) and cp.chapter_id = map.old_id
            """,
            "with map(old_id, new_id) as (values "
            + values
            + """
            )
            update public.reading_progress rp
               set chapter_id = map.new_id,
                   updated_at = cast(:now as timestamptz)
              from map
             where rp.user_id = cast(:user_id as uuid) and rp.chapter_id = map.old_id
            """,
            "with map(old_id, new_id) as (values "
            + values
            + """
            )
            update public.chapter_summaries cs
               set chapter_id = map.new_id
              from map
             where cs.user_id = cast(:user_id as uuid) and cs.chapter_id = map.old_id
            """,
            "with map(old_id, new_id) as (values "
            + values
            + """
            )
            update public.course_sections s
               set chapter_id = map.new_id,
                   updated_at = cast(:now as timestamptz)
              from map
             where s.owner_id = cast(:user_id as uuid) and s.chapter_id = map.old_id
            """,
            """
            update public.resources r
               set formation_id = cast(:formation_id as uuid)
             where r.owner_id = cast(:user_id as uuid)
               and r.formation_id = cast(:source_id as uuid)
               and r.chapter_id is null
            """,
            "with map(old_id, new_id) as (values "
            + values
            + """
            )
            update public.resources r
               set formation_id = cast(:formation_id as uuid),
                   chapter_id = map.new_id,
                   updated_at = cast(:now as timestamptz)
              from map
             where r.owner_id = cast(:user_id as uuid)
               and r.formation_id = cast(:source_id as uuid)
               and r.chapter_id = map.old_id
            """,
        ):
            await tx.conn.execute(text(statement), {**now_param, **parameters})

    if notion_pairs:
        values, parameters = _pairs(notion_pairs, "ns")
        await tx.conn.execute(
            text(
                "with map(old_id, new_id) as (values "
                + values
                + """
                )
                update public.notion_states ns
                   set notion_id = map.new_id,
                       gap_confused_with = (
                         select m2.new_id from map m2 where m2.old_id = ns.gap_confused_with
                       ),
                       updated_at = cast(:now as timestamptz)
                  from map
                 where ns.user_id = cast(:user_id as uuid) and ns.notion_id = map.old_id
                """
            ),
            {**now_param, **parameters},
        )
        await tx.conn.execute(
            text(
                """
                update public.bricks b
                   set formation_id = cast(:formation_id as uuid),
                       notion_ids = coalesce(
                         (
                           select array_agg(coalesce(m.new_id, x.old_id) order by x.ord)
                             from unnest(b.notion_ids) with ordinality as x(old_id, ord)
                             left join (values """
                + values
                + """) as m(old_id, new_id)
                               on m.old_id = x.old_id
                         ),
                         '{}'::uuid[]
                       )
                 where b.owner_id = cast(:user_id as uuid)
                   and b.formation_id = cast(:source_id as uuid)
                """
            ),
            {**now_param, **parameters},
        )
        await tx.conn.execute(
            text(
                "with map(old_id, new_id) as (values "
                + values
                + """
                )
                update public.course_sections s
                   set notion_ids = coalesce(
                         (
                           select array_agg(coalesce(map.new_id, x.old_id) order by x.ord)
                             from unnest(s.notion_ids) with ordinality as x(old_id, ord)
                             left join map on map.old_id = x.old_id
                         ),
                         '{}'::uuid[]
                       )
                 where s.owner_id = cast(:user_id as uuid)
                   and exists (
                     select 1 from public.courses c
                      where c.id = s.course_id
                        and c.owner_id = cast(:user_id as uuid)
                        and c.formation_id = cast(:formation_id as uuid)
                   )
                """
            ),
            {**now_param, **parameters},
        )

    await tx.conn.execute(
        text(
            """
            update public.modules m
               set status = mp.status,
                   opened_at = mp.opened_at,
                   validated_at = mp.validated_at,
                   updated_at = cast(:now as timestamptz)
              from public.module_progress mp
             where mp.module_id = m.id
               and mp.user_id = cast(:user_id as uuid)
               and m.formation_id = cast(:formation_id as uuid)
            """
        ),
        now_param,
    )
    await tx.conn.execute(
        text(
            """
            update public.modules m
               set status = 'open'::public.module_status,
                   opened_at = cast(:now as timestamptz),
                   updated_at = cast(:now as timestamptz)
             where m.formation_id = cast(:formation_id as uuid)
               and m.id = (
                 select first_module.id
                   from public.modules first_module
                  where first_module.formation_id = cast(:formation_id as uuid)
                  order by first_module.position
                  limit 1
               )
               and not exists (
                 select 1 from public.module_progress mp
                  where mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
               )
            """
        ),
        now_param,
    )
    return formation_id


def program_json(payload: Any) -> str:
    """Canonical JSON of a payload, for the diagnostics of an import."""
    return json.dumps(payload, ensure_ascii=False)
