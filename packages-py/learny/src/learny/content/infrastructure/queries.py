"""SQL of the content context (SPEC-2203).

`${x}` placeholders become bound `:x` parameters; nothing here reads the clock.
"""

import uuid
from collections.abc import Mapping
from typing import Any

from sqlalchemy import text

from learny.shared.db.uow import Tx

NO_RESOURCE = "00000000-0000-0000-0000-000000000000"

LOCK_OWNER = text("select pg_advisory_xact_lock(hashtextextended(cast(:user_id as uuid)::text, 104))")
SELECT_RESOURCE = text(
    """
    select r.id::text as id, r.owner_id::text as owner_id, r.formation_id::text as formation_id,
           r.chapter_id::text as chapter_id, r.kind::text as kind, r.title, r.storage_path,
           r.mime, r.size_bytes::float8 as size_bytes, r.status::text as status, r.metadata,
           r.deleted_at, r.updated_at
      from public.resources r
     where r.id = cast(:id as uuid)
    """
)
SELECT_RESOURCE_FOR_UPDATE = text(
    """
    select r.id::text as id, r.owner_id::text as owner_id, r.formation_id::text as formation_id,
           r.chapter_id::text as chapter_id, r.kind::text as kind, r.title, r.storage_path,
           r.mime, r.size_bytes::float8 as size_bytes, r.status::text as status, r.metadata,
           r.deleted_at, r.updated_at
      from public.resources r
     where r.id = cast(:id as uuid)
     for update
    """
)
EXISTS_RESOURCE = text(
    "select exists (select 1 from public.resources where id = cast(:id as uuid)) as present"
)
EXISTS_CHAPTER = text("select exists (select 1 from public.chapters where id = cast(:id as uuid)) as present")
SELECT_CHAPTER_FORMATION = text(
    "select c.id::text as id, c.formation_id::text as formation_id "
    "from public.chapters c where c.id = cast(:id as uuid)"
)
RELEASE_EXPIRED_RESERVATIONS = text(
    """
    update public.resources
       set deleted_at = cast(:now as timestamptz)
     where owner_id = cast(:user_id as uuid)
       and deleted_at is null
       and size_bytes is null
       and metadata -> 'upload' ->> 'reservedUntil' is not null
       and (metadata -> 'upload' ->> 'reservedUntil')::timestamptz <= cast(:now as timestamptz)
       and id <> cast(:except_id as uuid)
    returning id::text as id
    """
)
USED_BYTES = text(
    """
    select (
      coalesce(sum(r.size_bytes) filter (where r.size_bytes is not null), 0)
      + coalesce(
          sum((r.metadata -> 'upload' ->> 'declaredBytes')::float8)
            filter (
              where r.size_bytes is null
                and r.metadata -> 'upload' ->> 'declaredBytes' is not null
                and (r.metadata -> 'upload' ->> 'reservedUntil')::timestamptz > cast(:now as timestamptz)
            ),
          0
        )
    )::float8 as used
      from public.resources r
     where r.owner_id = cast(:user_id as uuid)
       and r.deleted_at is null
       and r.id <> cast(:except_id as uuid)
    """
)
CHAPTER_RESOURCE_COUNT = text(
    """
    select count(*)::int as total
      from public.resources r
     where r.owner_id = cast(:user_id as uuid)
       and r.chapter_id = cast(:chapter_id as uuid)
       and r.deleted_at is null
       and r.id <> cast(:except_id as uuid)
    """
)
FIND_BY_IDEMPOTENCY_KEY = text(
    """
    select r.id::text as id, r.owner_id::text as owner_id, r.formation_id::text as formation_id,
           r.chapter_id::text as chapter_id, r.kind::text as kind, r.title, r.storage_path,
           r.mime, r.size_bytes::float8 as size_bytes, r.status::text as status, r.metadata,
           r.deleted_at, r.updated_at
      from public.resources r
     where r.owner_id = cast(:user_id as uuid)
       and r.deleted_at is null
       and r.metadata -> 'upload' ->> 'idempotencyKey' = :key
     limit 1
    """
)
DISCARD_RESOURCE = text(
    "update public.resources set deleted_at = cast(:now as timestamptz) "
    "where id = cast(:id as uuid) and deleted_at is null"
)
INSERT_UPLOAD_RESOURCE = text(
    """
    insert into public.resources (
      id, owner_id, formation_id, chapter_id, kind, title, storage_path, status, metadata
    ) values (
      cast(:id as uuid), cast(:user_id as uuid), cast(:formation_id as uuid),
      cast(:chapter_id as uuid), cast(:kind as public.resource_kind), :title, :path,
      'queued', cast(:metadata as jsonb)
    )
    """
)
UPDATE_UPLOAD_RESERVATION = text(
    "update public.resources set metadata = cast(:metadata as jsonb) where id = cast(:id as uuid)"
)
INSERT_TEXT_RESOURCE = text(
    """
    insert into public.resources (
      owner_id, formation_id, chapter_id, kind, title, content_text, url, status
    ) values (
      cast(:user_id as uuid), cast(:formation_id as uuid), cast(:chapter_id as uuid),
      cast(:kind as public.resource_kind), :title, :text, :url, 'queued'
    )
    returning id::text as id
    """
)
UPDATE_FINALIZED_FILE = text(
    """
    update public.resources r
       set mime = :mime,
           size_bytes = :size_bytes,
           metadata = cast(:metadata as jsonb)
     where r.id = cast(:id as uuid) and r.owner_id = cast(:user_id as uuid)
       and r.deleted_at is null and r.size_bytes is null
    returning r.id::text as id, r.owner_id::text as owner_id, r.formation_id::text as formation_id,
              r.chapter_id::text as chapter_id, r.kind::text as kind, r.title, r.storage_path,
              r.mime, r.size_bytes::float8 as size_bytes, r.status::text as status, r.metadata,
              r.deleted_at, r.updated_at
    """
)
MARK_UPLOADED_EVENT = text(
    """
    update public.resources
       set metadata = jsonb_set(metadata, '{upload,eventEmittedAt}', to_jsonb(cast(:now as text)))
     where id = cast(:id as uuid) and owner_id = cast(:user_id as uuid)
    """
)
SELECT_RENAME_FOR_UPDATE = text(
    """
    select r.id::text as id, r.title, r.status::text as status, r.updated_at
      from public.resources r
     where r.id = cast(:id as uuid)
       and r.owner_id = cast(:user_id as uuid)
       and r.deleted_at is null
     for update
    """
)
UPDATE_RENAME = text(
    """
    update public.resources r
       set title = :title, updated_at = cast(:now as timestamptz)
     where r.id = cast(:id as uuid)
       and r.owner_id = cast(:user_id as uuid)
       and r.deleted_at is null
    returning r.id::text as id, r.title, r.status::text as status, r.updated_at
    """
)
SELECT_RETRY = text(
    """
    select r.id::text as id, r.formation_id::text as formation_id,
           r.chapter_id::text as chapter_id, r.kind::text as kind, r.status::text as status,
           r.error_code, r.error_message, r.metadata, r.updated_at
      from public.resources r
     where r.id = cast(:id as uuid)
       and r.owner_id = cast(:user_id as uuid)
       and r.deleted_at is null
     for update
    """
)
SELECT_RETRY_CURRENT = text(
    """
    select r.id::text as id, r.formation_id::text as formation_id,
           r.chapter_id::text as chapter_id, r.kind::text as kind, r.status::text as status,
           r.error_code, r.error_message, r.metadata, r.updated_at
      from public.resources r
     where r.id = cast(:id as uuid) and r.owner_id = cast(:user_id as uuid)
    """
)
UPDATE_RETRY = text(
    """
    update public.resources r
       set status = 'queued', error_code = null, error_message = null,
           updated_at = cast(:now as timestamptz)
     where r.id = cast(:id as uuid)
       and r.owner_id = cast(:user_id as uuid)
       and r.deleted_at is null
       and r.status = 'failed'
    returning r.id::text as id, r.formation_id::text as formation_id,
              r.chapter_id::text as chapter_id, r.kind::text as kind, r.status::text as status,
              r.error_code, r.error_message, r.metadata, r.updated_at
    """
)
SOFT_DELETE_RESOURCE = text(
    """
    update public.resources
       set deleted_at = cast(:now as timestamptz)
     where id = cast(:id as uuid) and owner_id = cast(:user_id as uuid) and deleted_at is null
    """
)
RELABEL_CITATIONS = text(
    """
    update public.citations
       set chunk_id = null, label = :label
     where resource_id = cast(:id as uuid) and owner_id = cast(:user_id as uuid)
    """
)

# --- suggestions --------------------------------

LOCK_SUGGESTION = text(
    """
    select r.id::text as id,
           r.title,
           r.url,
           r.chapter_id::text as chapter_id,
           r.formation_id::text as formation_id,
           r.suggestion_status::text as suggestion_status,
           coalesce(mp.status, m.status)::text as module_status
      from public.resources r
      left join public.chapters c on c.id = r.chapter_id
      left join public.modules m on m.id = c.module_id
      left join public.module_progress mp on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
     where r.id = cast(:id as uuid)
       and r.owner_id = cast(:user_id as uuid)
       and r.origin = 'tutor_suggestion'
       and r.deleted_at is null
     for update of r
    """
)
SELECT_IMPORTED_RESOURCE = text(
    """
    select r.id::text as id
      from public.resources r
     where r.owner_id = cast(:user_id as uuid)
       and r.chapter_id = cast(:chapter_id as uuid)
       and r.origin = 'learner'
       and r.kind = 'web'
       and r.url = :url
       and r.deleted_at is null
     limit 1
    """
)
MARK_SUGGESTION_STATUS = text(
    """
    update public.resources
       set suggestion_status = cast(:status as public.suggestion_status),
           updated_at = cast(:now as timestamptz)
     where id = cast(:id as uuid) and owner_id = cast(:user_id as uuid)
    """
)

# --- chapters.complete ---------------------

SELECT_CHAPTER_FOR_COMPLETION = text(
    """
    select c.id::text as id,
           c.module_id::text as module_id,
           c.formation_id::text as formation_id,
           coalesce(mp.status, m.status)::text as module_status,
           cp.contributions_status::text as contributions_status,
           cp.done_at
      from public.chapters c
      join public.modules m on m.id = c.module_id
      left join public.module_progress mp on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
      left join public.chapter_progress cp on cp.chapter_id = c.id and cp.user_id = cast(:user_id as uuid)
     where c.id = cast(:id as uuid)
     for update of c
    """
)
LOCK_CHAPTER = text("select pg_advisory_xact_lock(hashtextextended(:key, 607))")
SELECT_CHAPTER_PROGRESS = text(
    """
    select cp.contributions_status::text as contributions_status, cp.done_at, cp.updated_at
      from public.chapter_progress cp
     where cp.user_id = cast(:user_id as uuid) and cp.chapter_id = cast(:chapter_id as uuid)
    """
)
CHAPTER_COUNTS = text(
    """
    select count(*)::int as total,
           count(*) filter (where cp.contributions_status = 'done')::int as done
      from public.chapters c
      left join public.chapter_progress cp on cp.chapter_id = c.id and cp.user_id = cast(:user_id as uuid)
     where c.module_id = cast(:module_id as uuid)
    """
)
UPSERT_CHAPTER_PROGRESS = text(
    """
    insert into public.chapter_progress (
      user_id, chapter_id, contributions_status, done_at, updated_at
    ) values (
      cast(:user_id as uuid), cast(:chapter_id as uuid),
      cast(:status as public.contrib_status), cast(:done_at as timestamptz),
      cast(:now as timestamptz)
    )
    on conflict (user_id, chapter_id) do update
    set contributions_status = excluded.contributions_status,
        done_at = excluded.done_at,
        updated_at = excluded.updated_at
    """
)
COUNT_FORMATION_RESOURCES = text(
    """
    select count(*)::int as total
      from public.resources r
     where r.owner_id = cast(:user_id as uuid)
       and r.formation_id = cast(:formation_id as uuid)
       and r.deleted_at is null
       and r.origin = 'learner'
    """
)

# --- modules.screen ----------------------------------

SELECT_MODULE = text(
    """
    select f.id::text as formation_id,
           f.title as formation_title,
           f.status::text as formation_status,
           m.id::text as id,
           m.position,
           m.title,
           coalesce(m.planned_start, f.start_date)::text as planned_start,
           coalesce(m.planned_end, f.end_date)::text as planned_end,
           m.threshold,
           coalesce(mp.status, m.status)::text as status,
           (select count(*) from public.modules mm where mm.formation_id = m.formation_id)::int
             as position_total
      from public.modules m
      join public.formations f on f.id = m.formation_id
      left join public.module_progress mp on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
     where m.id = cast(:id as uuid)
    """
)
SELECT_MODULE_CHAPTERS = text(
    """
    select c.id::text as id,
           c.position,
           c.title,
           coalesce(cp.contributions_status, 'in_progress')::text as contributions_status,
           cp.done_at,
           (
             select count(*)::int
               from public.resources r
              where r.chapter_id = c.id
                and r.owner_id = cast(:user_id as uuid)
                and r.origin = 'learner'
                and r.deleted_at is null
           ) as resource_count
      from public.chapters c
      left join public.chapter_progress cp on cp.chapter_id = c.id and cp.user_id = cast(:user_id as uuid)
     where c.module_id = cast(:module_id as uuid)
     order by c.position asc
    """
)
SELECT_CHAPTER_RESOURCES = text(
    """
    select r.id::text as id, r.kind::text as kind, r.origin::text as origin,
           r.suggestion_status::text as suggestion_status, r.title, r.url, r.metadata,
           r.status::text as status, r.error_code, r.error_message,
           r.size_bytes::float8 as size_bytes, r.created_at, r.updated_at
      from public.resources r
     where r.owner_id = cast(:user_id as uuid)
       and r.chapter_id = cast(:chapter_id as uuid)
       and r.origin = 'learner'
       and r.deleted_at is null
     order by r.created_at asc, r.id asc
    """
)
SELECT_CHAPTER_SUGGESTIONS = text(
    """
    select r.id::text as id, r.kind::text as kind, r.origin::text as origin,
           r.suggestion_status::text as suggestion_status, r.title, r.url, r.metadata,
           r.status::text as status, r.error_code, r.error_message,
           r.size_bytes::float8 as size_bytes, r.created_at, r.updated_at
      from public.resources r
     where r.owner_id = cast(:user_id as uuid)
       and r.chapter_id = cast(:chapter_id as uuid)
       and r.origin = 'tutor_suggestion'
       and r.suggestion_status = 'pending'
       and r.deleted_at is null
     order by r.created_at desc, r.id desc
    """
)
STORAGE_USED = text(
    """
    select coalesce(sum(r.size_bytes), 0)::float8 as used
      from public.resources r
     where r.owner_id = cast(:user_id as uuid)
       and r.deleted_at is null
       and r.size_bytes is not null
    """
)

# --- modules.generateCourse ------------------------

SELECT_GENERATION_ACCESS = text(
    """
    select m.id::text as module_id,
           coalesce(mp.status, m.status)::text as module_status,
           (select count(*)::int from public.chapters c where c.module_id = m.id) as chapters_total,
           (
             select count(*)::int
               from public.chapters c
               join public.chapter_progress cp on cp.chapter_id = c.id and cp.user_id = cast(:user_id as uuid)
              where c.module_id = m.id and cp.contributions_status = 'done'
           ) as chapters_done,
           (
             select count(*)::int
               from public.resources r
               join public.chapters c on c.id = r.chapter_id
              where c.module_id = m.id
                and r.owner_id = cast(:user_id as uuid)
                and r.origin = 'learner'
                and r.deleted_at is null
           ) as resource_count
      from public.modules m
      left join public.module_progress mp on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
     where m.id = cast(:id as uuid)
    """
)

# --- modules.course --------------------------------

SELECT_COURSE_MODULE = text(
    """
    select f.id::text as formation_id, f.title as formation_title,
           m.id::text as module_id, m.title as module_title,
           m.position as module_position,
           (select count(*)::int from public.modules sibling where sibling.formation_id = f.id)
             as modules_total,
           f.default_threshold as threshold
      from public.modules m
      join public.formations f on f.id = m.formation_id
     where m.id = cast(:id as uuid)
     limit 1
    """
)
SELECT_COURSE_CHAPTERS = text(
    """
    select id::text as id, position, title
      from public.chapters
     where module_id = cast(:module_id as uuid)
     order by position asc, id asc
    """
)
SELECT_CURRENT_COURSE = text(
    """
    select id::text as id, version, status::text as status, model, error, created_at
      from public.courses
     where owner_id = cast(:user_id as uuid)
       and module_id = cast(:module_id as uuid)
       and is_current
     order by version desc
     limit 1
    """
)
SELECT_LATEST_COURSE = text(
    """
    select id::text as id, version, status::text as status, model, error, created_at
      from public.courses
     where owner_id = cast(:user_id as uuid) and module_id = cast(:module_id as uuid)
     order by version desc
     limit 1
    """
)
COUNT_SECTIONS_BY_CHAPTER = text(
    """
    select chapter_id::text as chapter_id, count(*)::int as total
      from public.course_sections
     where course_id = cast(:course_id as uuid)
     group by chapter_id
    """
)
SELECT_COURSE_SECTIONS = text(
    """
    select id::text as id, chapter_id::text as chapter_id, position, kind::text as kind, anchor,
           title, content_md, data, origin::text as origin, notion_ids, version, reported
      from public.course_sections
     where course_id = cast(:course_id as uuid)
       and chapter_id = cast(:chapter_id as uuid)
     order by position asc, id asc
    """
)
SELECT_SECTION_CITATIONS = text(
    """
    select ci.id::text as id,
           ci.section_id::text as section_id,
           ci.chunk_id::text as chunk_id,
           ci.resource_id::text as resource_id,
           ci.quote,
           ci.location,
           ci.label,
           ci.media_kind::text as media_kind,
           (
             ci.chunk_id is null
             or not exists (
               select 1
                 from public.resource_chunks c
                 join public.resources r on r.id = c.resource_id
                where c.id = ci.chunk_id
                  and c.owner_id = ci.owner_id
                  and r.status = 'ready'
                  and r.deleted_at is null
             )
           ) as deleted
      from public.citations ci
     where ci.section_id = any(cast(:section_ids as uuid[]))
     order by ci.created_at asc, ci.id asc
    """
)
COUNT_READY_RESOURCES = text(
    """
    select count(distinct r.id)::int as total
      from public.resources r
     where r.owner_id = cast(:user_id as uuid)
       and r.chapter_id = cast(:chapter_id as uuid)
       and r.origin = 'learner'
       and r.status = 'ready'
       and r.deleted_at is null
    """
)
SELECT_COURSE_SUGGESTIONS = text(
    """
    select r.id::text as id, r.title, r.url, r.metadata ->> 'suggestionReason' as reason
      from public.resources r
     where r.owner_id = cast(:user_id as uuid)
       and r.chapter_id = cast(:chapter_id as uuid)
       and r.origin = 'tutor_suggestion'
       and r.suggestion_status = 'pending'
       and r.deleted_at is null
       and r.url is not null
     order by r.created_at asc, r.id asc
    """
)
SELECT_CHAPTER_SUMMARY = text(
    """
    select id::text as id, chapter_id::text as chapter_id, course_id::text as course_id,
           text, feedback, created_at
      from public.chapter_summaries
     where user_id = cast(:user_id as uuid)
       and chapter_id = cast(:chapter_id as uuid)
       and course_id = cast(:course_id as uuid)
     order by created_at desc, id desc
     limit 1
    """
)
SELECT_CHAPTER_NOTIONS = text(
    """
    select n.id::text as id, n.label, ns.mastery::text as mastery, ns.gap_nature::text as gap_nature
      from public.notions n
      left join public.notion_states ns on ns.notion_id = n.id and ns.user_id = cast(:user_id as uuid)
     where n.chapter_id = cast(:chapter_id as uuid)
     order by n.position, n.id
    """
)

# --- courses.progress --------------------------------

LOCK_COURSE_PROGRESS = text("select pg_advisory_xact_lock(hashtextextended(:key, 0))")
SELECT_PROGRESS_COURSE = text(
    """
    select id::text as id, module_id::text as module_id
      from public.courses
     where id = cast(:id as uuid)
       and owner_id = cast(:user_id as uuid)
       and is_current
       and status = 'ready'
     limit 1
    """
)
SELECT_PROGRESS_CHAPTERS = text(
    """
    select ch.id::text as id,
           count(cs.id)::int as total,
           rp.percent,
           rp.updated_at
      from public.chapters ch
      left join public.course_sections cs on cs.chapter_id = ch.id and cs.course_id = cast(:course_id as uuid)
      left join public.reading_progress rp
        on rp.user_id = cast(:user_id as uuid)
       and rp.course_id = cast(:course_id as uuid)
       and rp.chapter_id = ch.id
     where ch.module_id = cast(:module_id as uuid)
     group by ch.id, ch.position, rp.percent, rp.updated_at
     order by ch.position asc, ch.id asc
    """
)
SELECT_CHAPTER_SECTIONS = text(
    """
    select id::text as id
      from public.course_sections
     where course_id = cast(:course_id as uuid) and chapter_id = cast(:chapter_id as uuid)
    """
)
UPSERT_READING_PROGRESS = text(
    """
    insert into public.reading_progress (user_id, course_id, chapter_id, percent, updated_at)
    values (cast(:user_id as uuid), cast(:course_id as uuid), cast(:chapter_id as uuid),
            :percent, cast(:now as timestamptz))
    on conflict (user_id, course_id, chapter_id) do update
      set percent = greatest(public.reading_progress.percent, excluded.percent),
          updated_at = excluded.updated_at
    """
)
SELECT_PROGRESS_BY_CHAPTER = text(
    """
    select chapter_id::text as chapter_id, percent
      from public.reading_progress
     where user_id = cast(:user_id as uuid) and course_id = cast(:course_id as uuid)
    """
)

# --- course-sections.edit / report ------

SELECT_EDIT_SECTION = text(
    """
    select s.id::text as id,
           s.course_id::text as course_id,
           c.formation_id::text as formation_id,
           s.chapter_id::text as chapter_id,
           s.version,
           s.title,
           s.content_md,
           s.reported,
           s.updated_at
      from public.course_sections s
      join public.courses c on c.id = s.course_id
     where s.id = cast(:id as uuid)
       and s.owner_id = cast(:user_id as uuid)
       and c.owner_id = cast(:user_id as uuid)
       and c.is_current
       and c.status = 'ready'
     limit 1
    """
)
SELECT_SECTION_EDIT_KEY = text(
    """
    select s.id::text as id
      from public.course_sections s
     where s.owner_id = cast(:user_id as uuid) and s.edit_request_key = :key
     limit 1
    """
)
UPDATE_SECTION_EDIT = text(
    """
    update public.course_sections
       set title = :title,
           content_md = :content_md,
           reported = false,
           edit_request_key = :request_key,
           updated_at = cast(:now as timestamptz)
     where id = cast(:id as uuid) and owner_id = cast(:user_id as uuid)
    """
)
RESOLVE_SECTION_REPORTS = text(
    """
    update public.course_section_reports
       set status = 'corrected', resolved_at = cast(:now as timestamptz)
     where section_id = cast(:id as uuid)
       and owner_id = cast(:user_id as uuid)
       and status = 'open'
    returning affected_brick_ids
    """
)
SELECT_OPEN_SECTION_REPORT = text(
    """
    select id::text as id, created_at
      from public.course_section_reports
     where section_id = cast(:id as uuid)
       and owner_id = cast(:user_id as uuid)
       and status = 'open'
     order by created_at desc, id desc
     limit 1
    """
)
SELECT_REPORT_KEY = text(
    """
    select id::text as id, section_id::text as section_id, created_at
      from public.course_section_reports
     where owner_id = cast(:user_id as uuid) and request_key = :key
     limit 1
    """
)
SELECT_REPORT_SECTION = text(
    """
    select s.id::text as id,
           s.course_id::text as course_id,
           c.formation_id::text as formation_id,
           s.notion_ids
      from public.course_sections s
      join public.courses c on c.id = s.course_id
     where s.id = cast(:id as uuid)
       and s.owner_id = cast(:user_id as uuid)
       and c.owner_id = cast(:user_id as uuid)
       and c.is_current
       and c.status = 'ready'
     limit 1
    """
)
MARK_SECTION_REPORTED = text(
    """
    update public.course_sections
       set reported = true, updated_at = cast(:now as timestamptz)
     where id = cast(:id as uuid) and owner_id = cast(:user_id as uuid)
    """
)
INSERT_SECTION_REPORT = text(
    """
    insert into public.course_section_reports (
      owner_id, section_id, reason, affected_brick_ids, request_key, created_at
    ) values (
      cast(:user_id as uuid), cast(:id as uuid), :reason,
      cast(:affected as uuid[]), :request_key, cast(:now as timestamptz)
    )
    returning id::text as id, created_at
    """
)
SELECT_BRICKS_FOR_NOTIONS = text(
    """
    select b.id::text as id
      from public.bricks b
     where b.owner_id = cast(:user_id as uuid)
       and b.formation_id = cast(:formation_id as uuid)
       and b.purpose in ('bank', 'validation')
       and b.status = 'active'
       and b.notion_ids && cast(:notion_ids as uuid[])
     order by b.id asc
    """
)
SUSPEND_BRICKS = text(
    """
    update public.bricks
       set status = 'reported'
     where owner_id = cast(:user_id as uuid)
       and id = any(cast(:ids as uuid[]))
       and status = 'active'
    """
)
REACTIVATE_BRICKS = text(
    """
    update public.bricks b
       set status = 'active'
     where b.owner_id = cast(:user_id as uuid)
       and b.id = any(cast(:ids as uuid[]))
       and b.status = 'reported'
       and not exists (
         select 1 from public.course_section_reports r
          where r.status = 'open' and b.id = any(r.affected_brick_ids)
       )
       and not exists (
         select 1 from public.brick_reports br
          where br.brick_id = b.id and br.status = 'open'
       )
    """
)

# --- course-citations.source -----------------

SELECT_CITATION_SOURCE = text(
    """
    select ci.id::text as id,
           ci.media_kind::text as media_kind,
           ci.location,
           ci.resource_id::text as resource_id,
           r.kind::text as resource_kind,
           r.url,
           r.deleted_at,
           r.status::text as status,
           r.storage_path
      from public.citations ci
      left join public.resources r on r.id = ci.resource_id and r.owner_id = ci.owner_id
     where ci.id = cast(:id as uuid)
       and ci.owner_id = cast(:user_id as uuid)
     limit 1
    """
)


async def rows(tx: Tx, statement: Any, params: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Runs a statement and returns plain mappings."""
    result = await tx.conn.execute(statement, dict(params))
    return [dict(item) for item in result.mappings().all()]


async def one(tx: Tx, statement: Any, params: Mapping[str, Any]) -> dict[str, Any] | None:
    """Runs a statement and returns its first row, or `None`."""
    found = await rows(tx, statement, params)
    return found[0] if found else None


async def execute(tx: Tx, statement: Any, params: Mapping[str, Any]) -> None:
    """Runs a writing statement whose rows are not needed."""
    await tx.conn.execute(statement, dict(params))


async def lock_owner(tx: Tx, user_id: str) -> None:
    """Serialises the capacity checks of one owner (namespace 104, like the trigger)."""
    await execute(tx, LOCK_OWNER, {"user_id": user_id})


async def exists_for_any_owner(tx: Tx, table: str, identifier: str) -> bool:
    """Distinguishes a missing identifier from another owner's one (EF-6)."""
    statement = EXISTS_RESOURCE if table == "resources" else EXISTS_CHAPTER
    found = await one(tx, statement, {"id": identifier})
    return bool(found and found["present"])


async def release_expired_reservations(tx: Tx, user_id: str, now: str, except_id: str | None = None) -> int:
    """Soft-deletes the reservations whose window ended, freeing their slot (ET-3)."""
    found = await rows(
        tx,
        RELEASE_EXPIRED_RESERVATIONS,
        {"user_id": user_id, "now": now, "except_id": except_id or NO_RESOURCE},
    )
    return len(found)


async def used_bytes(tx: Tx, user_id: str, now: str, except_id: str | None = None) -> float:
    """Finalized bytes plus the reservations still alive (ET-3)."""
    found = await one(tx, USED_BYTES, {"user_id": user_id, "now": now, "except_id": except_id or NO_RESOURCE})
    return float(found["used"]) if found else 0.0


async def chapter_resource_count(tx: Tx, user_id: str, chapter_id: str, except_id: str | None = None) -> int:
    """Live contributions of the chapter, `except_id` excluded."""
    found = await one(
        tx,
        CHAPTER_RESOURCE_COUNT,
        {"user_id": user_id, "chapter_id": chapter_id, "except_id": except_id or NO_RESOURCE},
    )
    return int(found["total"]) if found else 0


async def select_resource(tx: Tx, resource_id: str) -> dict[str, Any] | None:
    """One resource of the caller, hidden by RLS for every other owner."""
    return await one(tx, SELECT_RESOURCE, {"id": resource_id})


async def select_resource_for_update(tx: Tx, resource_id: str) -> dict[str, Any] | None:
    """The same row, locked."""
    return await one(tx, SELECT_RESOURCE_FOR_UPDATE, {"id": resource_id})


async def select_chapter_formation(tx: Tx, chapter_id: str) -> dict[str, Any] | None:
    """The chapter and the formation it belongs to."""
    return await one(tx, SELECT_CHAPTER_FORMATION, {"id": chapter_id})


async def find_by_idempotency_key(tx: Tx, user_id: str, key: str) -> dict[str, Any] | None:
    """A creation replayed with the same key finds its resource again (ET-4)."""
    return await one(tx, FIND_BY_IDEMPOTENCY_KEY, {"user_id": user_id, "key": key})


async def discard_resource(tx: Tx, resource_id: str, now: str) -> None:
    """Soft deletion of a refused or abandoned upload."""
    await execute(tx, DISCARD_RESOURCE, {"id": resource_id, "now": now})


async def insert_upload_resource(
    tx: Tx,
    *,
    resource_id: str,
    user_id: str,
    formation_id: str,
    chapter_id: str,
    kind: str,
    title: str,
    path: str,
    metadata: str,
) -> None:
    """Reserves a file contribution (EF-1)."""
    await execute(
        tx,
        INSERT_UPLOAD_RESOURCE,
        {
            "id": resource_id,
            "user_id": user_id,
            "formation_id": formation_id,
            "chapter_id": chapter_id,
            "kind": kind,
            "title": title,
            "path": path,
            "metadata": metadata,
        },
    )


async def update_upload_reservation(tx: Tx, resource_id: str, metadata: str) -> None:
    """Refreshes the reservation window of a replayed upload."""
    await execute(tx, UPDATE_UPLOAD_RESERVATION, {"id": resource_id, "metadata": metadata})


async def insert_text_resource(
    tx: Tx,
    *,
    user_id: str,
    formation_id: str,
    chapter_id: str,
    kind: str,
    title: str,
    content_text: str | None,
    url: str | None,
) -> str:
    """Creates a note, web or YouTube contribution and returns its identifier."""
    found = await one(
        tx,
        INSERT_TEXT_RESOURCE,
        {
            "user_id": user_id,
            "formation_id": formation_id,
            "chapter_id": chapter_id,
            "kind": kind,
            "title": title,
            "text": content_text,
            "url": url,
        },
    )
    if found is None:
        raise RuntimeError("resource insert returned no row")
    return str(found["id"])


async def update_finalized_file(
    tx: Tx, *, resource_id: str, user_id: str, mime: str, size_bytes: int, metadata: str
) -> dict[str, Any] | None:
    """Records `mime`, `size_bytes` and the fingerprint of a finalized upload (ET-3, ET-5)."""
    return await one(
        tx,
        UPDATE_FINALIZED_FILE,
        {
            "id": resource_id,
            "user_id": user_id,
            "mime": mime,
            "size_bytes": size_bytes,
            "metadata": metadata,
        },
    )


async def mark_uploaded_event(tx: Tx, resource_id: str, user_id: str, now: str) -> None:
    """Marks the single `resource/uploaded` emission of a resource."""
    await execute(tx, MARK_UPLOADED_EVENT, {"id": resource_id, "user_id": user_id, "now": now})


async def lock_suggestion(tx: Tx, user_id: str, suggestion_id: str) -> dict[str, Any] | None:
    """The suggestion of the caller, locked (`for update of r`)."""
    return await one(tx, LOCK_SUGGESTION, {"user_id": user_id, "id": suggestion_id})


async def mark_suggestion_status(tx: Tx, user_id: str, suggestion_id: str, status: str, now: str) -> None:
    """Records the learner's decision on a suggestion."""
    await execute(
        tx,
        MARK_SUGGESTION_STATUS,
        {"user_id": user_id, "id": suggestion_id, "status": status, "now": now},
    )


async def select_imported_resource(tx: Tx, user_id: str, chapter_id: str, url: str) -> dict[str, Any] | None:
    """An already imported contribution with the same URL is reused (BR-APP-05)."""
    return await one(tx, SELECT_IMPORTED_RESOURCE, {"user_id": user_id, "chapter_id": chapter_id, "url": url})


# --- chapters.summary ---------------------------------

LOCK_CHAPTER_SUMMARY = text("select pg_advisory_xact_lock(hashtextextended(:key, 0))")
FIND_CHAPTER_SUMMARY = text(
    """
    select id::text as id, chapter_id::text as chapter_id, course_id::text as course_id,
           text, feedback, created_at
      from public.chapter_summaries
     where user_id = cast(:user_id as uuid) and request_key = :request_key
     limit 1
    """
)
SELECT_SUMMARY_COURSE = text(
    """
    select c.id::text as id, c.module_id::text as module_id, c.formation_id::text as formation_id
      from public.courses c
     where c.id = cast(:course_id as uuid)
       and c.owner_id = cast(:user_id as uuid)
       and c.is_current
       and c.status = 'ready'
     limit 1
    """
)
SELECT_SUMMARY_CHAPTER = text(
    """
    select ch.id::text as id, ch.title
      from public.chapters ch
      join public.course_sections cs
        on cs.chapter_id = ch.id and cs.course_id = cast(:course_id as uuid)
     where ch.id = cast(:chapter_id as uuid) and ch.module_id = cast(:module_id as uuid)
     limit 1
    """
)
INSERT_CHAPTER_SUMMARY = text(
    """
    insert into public.chapter_summaries (
      user_id, chapter_id, course_id, text, request_key, created_at
    ) values (
      cast(:user_id as uuid), cast(:chapter_id as uuid), cast(:course_id as uuid), :text,
      :request_key, cast(:created_at as timestamptz)
    )
    returning id::text as id, chapter_id::text as chapter_id, course_id::text as course_id,
              text, feedback, created_at
    """
)
SELECT_SUMMARY_KEY_POINTS = text(
    """
    select data
      from public.course_sections
     where course_id = cast(:course_id as uuid)
       and chapter_id = cast(:chapter_id as uuid)
       and kind = 'retain'
     order by position asc
     limit 1
    """
)
UPDATE_CHAPTER_SUMMARY_FEEDBACK = text(
    """
    update public.chapter_summaries
       set feedback = cast(:feedback as jsonb)
     where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)
    """
)


def is_uuid(value: object) -> bool:
    """A canonical UUID, the same check as the Zod `Uuid` of the contract."""
    if not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        return False
    return True


async def lock_chapter_summary(tx: Tx, user_id: str, chapter_id: str) -> None:
    """Serialises the summaries of one (learner, chapter) pair (ET-2)."""
    await execute(tx, LOCK_CHAPTER_SUMMARY, {"key": f"chapter-summary:{user_id}:{chapter_id}"})


async def find_chapter_summary(tx: Tx, user_id: str, request_key: str) -> dict[str, Any] | None:
    """A replay with the same request key returns the first summary (ET-2)."""
    return await one(tx, FIND_CHAPTER_SUMMARY, {"user_id": user_id, "request_key": request_key})


async def select_summary_course(tx: Tx, user_id: str, course_id: str) -> dict[str, Any] | None:
    """The current, ready course of the caller (BR-COU-10)."""
    return await one(tx, SELECT_SUMMARY_COURSE, {"user_id": user_id, "course_id": course_id})


async def select_summary_chapter(
    tx: Tx, chapter_id: str, module_id: str, course_id: str
) -> dict[str, Any] | None:
    """The chapter, only when the course has a section for it."""
    return await one(
        tx,
        SELECT_SUMMARY_CHAPTER,
        {"chapter_id": chapter_id, "module_id": module_id, "course_id": course_id},
    )


async def insert_chapter_summary(
    tx: Tx,
    *,
    user_id: str,
    chapter_id: str,
    course_id: str,
    text: str,
    request_key: str | None,
    created_at: str,
) -> dict[str, Any] | None:
    """The committed summary; `None` when the insert returned no row."""
    return await one(
        tx,
        INSERT_CHAPTER_SUMMARY,
        {
            "user_id": user_id,
            "chapter_id": chapter_id,
            "course_id": course_id,
            "text": text,
            "request_key": request_key,
            "created_at": created_at,
        },
    )


async def select_summary_key_points(tx: Tx, course_id: str, chapter_id: str) -> Any:
    """The `data` of the "A retenir" section, used as the expected content."""
    found = await one(tx, SELECT_SUMMARY_KEY_POINTS, {"course_id": course_id, "chapter_id": chapter_id})
    return None if found is None else found.get("data")


async def update_chapter_summary_feedback(tx: Tx, *, row_id: str, user_id: str, feedback: str) -> None:
    """Stores the tutor correction on the committed summary (BR-COU-07)."""
    await execute(
        tx,
        UPDATE_CHAPTER_SUMMARY_FEEDBACK,
        {"id": row_id, "user_id": user_id, "feedback": feedback},
    )
