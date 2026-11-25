"""SQL of the ingestion pipeline (SPEC-509 ET-1 to ET-5, SPEC-510).

Copied statement by statement: same columns, same `for update`, same jsonb marker patches, same
guarded updates.
"""

# ruff: noqa: S608 - only the constant column list is interpolated, never a request value.

from sqlalchemy import text

RESOURCE_COLUMNS = """
  r.id::text as id, r.owner_id::text as owner_id, r.formation_id::text as formation_id,
  r.chapter_id::text as chapter_id, r.kind::text as kind, r.title, r.content_text,
  r.storage_path, r.url, r.mime, r.size_bytes::float8 as size_bytes, r.status::text as status,
  r.error_code, r.error_message, r.metadata, r.deleted_at,
  (select count(*)::int from public.resource_chunks c where c.resource_id = r.id) as chunk_count
"""

SELECT_RESOURCE = text(
    f"""
    select {RESOURCE_COLUMNS}
      from public.resources r
     where r.id = cast(:id as uuid)
    """
)
SELECT_RESOURCE_FOR_UPDATE = text(
    f"""
    select {RESOURCE_COLUMNS}
      from public.resources r
     where r.id = cast(:id as uuid)
     for update of r
    """
)
SELECT_CHUNK_COUNT = text(
    "select count(*)::int as total from public.resource_chunks where resource_id = cast(:id as uuid)"
)
MARK_PROCESSING = text(
    f"""
    update public.resources r
       set status = 'processing',
           error_code = null,
           error_message = null,
           metadata = jsonb_set(
             r.metadata,
             '{{ingestion}}',
             (
               coalesce(r.metadata -> 'ingestion', '{{}}'::jsonb)
                 || cast(:patch as jsonb)
                 || jsonb_build_object(
                   'attempts',
                   coalesce((r.metadata -> 'ingestion' ->> 'attempts')::int, 0) + 1
                 )
             ) - 'failedAt' - 'failedEventClaimedAt' - 'failedEventEmittedAt'
               - 'readyEventClaimedAt' - 'readyEventEmittedAt' - 'completedAt'
           )
     where r.id = cast(:id as uuid)
       and r.deleted_at is null
       and r.status <> 'ready'
    returning {RESOURCE_COLUMNS}
    """
)
DELETE_CHUNKS = text("delete from public.resource_chunks where resource_id = cast(:id as uuid)")
INSERT_CHUNK = text(
    """
    insert into public.resource_chunks (
      resource_id, owner_id, formation_id, chapter_id, position, text, location,
      token_count, embedding, created_at
    ) values (
      cast(:resource_id as uuid), cast(:owner_id as uuid), cast(:formation_id as uuid),
      cast(:chapter_id as uuid), :position, :text, cast(:location as jsonb), :token_count,
      cast(:embedding as extensions.vector), cast(:created_at as timestamptz)
    )
    """
)
UPDATE_READY = text(
    """
    update public.resources
       set status = 'ready',
           title = :title,
           error_code = null,
           error_message = null,
           metadata = cast(:metadata as jsonb)
     where id = cast(:id as uuid) and deleted_at is null
    """
)
SELECT_EVENT_EMITTED = text(
    """
    select coalesce(metadata -> 'ingestion' ->> :emitted, null) is not null as emitted
      from public.resources
     where id = cast(:id as uuid)
    """
)
CLAIM_EVENT = text(
    """
    update public.resources
       set metadata = jsonb_set(
         metadata,
         cast(:path as text[]),
         to_jsonb(cast(:now as text))
       )
     where id = cast(:id as uuid)
       and deleted_at is null
       and metadata -> 'ingestion' ->> :emitted is null
       and (
         metadata -> 'ingestion' ->> :claimed is null
         or (metadata -> 'ingestion' ->> :claimed)::timestamptz < cast(:stale_before as timestamptz)
       )
    returning id::text as id
    """
)
MARK_EVENT_EMITTED = text(
    """
    update public.resources
       set metadata = jsonb_set(
         metadata,
         cast(:path as text[]),
         to_jsonb(cast(:now as text))
       )
     where id = cast(:id as uuid)
    """
)
CLEAR_EVENT_CLAIM = text(
    """
    update public.resources
       set metadata = metadata #- cast(:path as text[])
     where id = cast(:id as uuid)
    """
)
MARK_FAILED = text(
    """
    update public.resources
       set status = 'failed',
           error_code = :code,
           error_message = :message,
           metadata = jsonb_set(
             metadata,
             '{ingestion}',
             coalesce(metadata -> 'ingestion', '{}'::jsonb) || cast(:patch as jsonb)
           )
     where id = cast(:id as uuid)
       and deleted_at is null
       and status <> 'ready'
    returning id::text as id
    """
)

__all__ = [
    "CLAIM_EVENT",
    "CLEAR_EVENT_CLAIM",
    "DELETE_CHUNKS",
    "INSERT_CHUNK",
    "MARK_EVENT_EMITTED",
    "MARK_FAILED",
    "MARK_PROCESSING",
    "SELECT_CHUNK_COUNT",
    "SELECT_EVENT_EMITTED",
    "SELECT_RESOURCE",
    "SELECT_RESOURCE_FOR_UPDATE",
    "SELECT_STALE_RESOURCES",
    "UPDATE_READY",
]

# Resources stuck in `queued`/`processing` with no live job left to finish them (QA 2026-11-25):
# untouched since `:before` and without a pending or running delivery of their ingestion event.
SELECT_STALE_RESOURCES = text(
    """
    select r.id::text as id
      from public.resources r
     where r.status in ('queued', 'processing')
       and r.deleted_at is null
       and r.kind::text = any(cast(:kinds as text[]))
       and r.updated_at < cast(:before as timestamptz)
       and not exists (
         select 1
           from public.event_outbox o
           left join public.job_deliveries d on d.event_id = o.event_id
          where o.data ->> 'resourceId' = r.id::text
            and (o.dispatched_at is null or d.status in ('pending', 'running'))
       )
     order by r.updated_at
     limit :limit
    """
)
