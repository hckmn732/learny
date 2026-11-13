// SQL of the file service (SPEC-206 ET-3, ET-5, ET-6).
//
// Every statement runs inside the transaction the caller opened: under `authenticated` for the
// user flows (Row Level Security applies), as the table owner only where the specification
// requires it (soft deletion of the passages, deferred blob cleanup). Dates are bound as ISO
// strings produced from the injected clock (ADR-0047); big integers are cast to `float8` because
// a file size stays far below 2^53.
import { AppError } from '@learny/core';
import { schema, serviceDb, sql, type DbTx } from '@learny/db';

export type ResourceMetadata = schema.ResourceMetadata;

export interface ResourceRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  formation_id: string;
  chapter_id: string | null;
  kind: string;
  title: string;
  storage_path: string | null;
  mime: string | null;
  size_bytes: number | null;
  status: string;
  metadata: ResourceMetadata;
  deleted_at: Date | null;
  updated_at: Date;
}

const RESOURCE_COLUMNS = sql`
  r.id::text as id, r.owner_id::text as owner_id, r.formation_id::text as formation_id,
  r.chapter_id::text as chapter_id, r.kind::text as kind, r.title, r.storage_path, r.mime,
  r.size_bytes::float8 as size_bytes, r.status::text as status, r.metadata, r.deleted_at,
  r.updated_at
`;

/**
 * Same advisory lock as the database trigger `enforce_resource_limits` (namespace 104): the
 * service check and the insert or update that follows are serialised per user, so two
 * simultaneous uploads can never both pass a bound only one of them fits under (ET-3, CL-4).
 */
export const OWNER_LOCK_NAMESPACE = 104;

export async function lockOwner(tx: DbTx, userId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${userId}::uuid::text, ${OWNER_LOCK_NAMESPACE}::bigint))`,
  );
}

/** One resource of the caller (the policies hide every other owner's), optionally row-locked. */
export async function selectResource(
  tx: DbTx,
  resourceId: string,
  options: { forUpdate?: boolean } = {},
): Promise<ResourceRow | null> {
  const rows = await tx.execute<ResourceRow>(sql`
    select ${RESOURCE_COLUMNS}
    from public.resources r
    where r.id = ${resourceId}::uuid
    ${options.forUpdate === true ? sql`for update` : sql``}
  `);
  return rows[0] ?? null;
}

/**
 * Tells a missing identifier from another user's one, for the `NOT_FOUND`/`FORBIDDEN` pair of EF-6.
 * It reads one boolean with the owner role and discloses nothing else (no path, no owner).
 */
export async function existsForAnyOwner(
  table: 'resources' | 'chapters',
  id: string,
): Promise<boolean> {
  const rows =
    table === 'resources'
      ? await serviceDb().execute<{ present: boolean }>(
          sql`select exists (select 1 from public.resources where id = ${id}::uuid) as present`,
        )
      : await serviceDb().execute<{ present: boolean }>(
          sql`select exists (select 1 from public.chapters where id = ${id}::uuid) as present`,
        );
  return rows[0]?.present === true;
}

export async function denyOrMissing(table: 'resources' | 'chapters', id: string): Promise<never> {
  const subject = table === 'resources' ? 'Cet apport' : 'Ce chapitre';
  if (await existsForAnyOwner(table, id)) {
    throw new AppError('FORBIDDEN', `${subject} ne vous appartient pas.`);
  }
  throw new AppError('NOT_FOUND', `${subject} est introuvable.`);
}

export async function selectChapterFormation(
  tx: DbTx,
  chapterId: string,
): Promise<{ id: string; formation_id: string } | null> {
  const rows = await tx.execute<{ id: string; formation_id: string }>(sql`
    select c.id::text as id, c.formation_id::text as formation_id
    from public.chapters c
    where c.id = ${chapterId}::uuid
  `);
  return rows[0] ?? null;
}

const NO_RESOURCE = '00000000-0000-0000-0000-000000000000';

/**
 * ET-3 — an unfinalized upload whose reservation window ended no longer holds anything: it is
 * soft-deleted (its blob is cleaned later), which also frees its slot in the chapter count that
 * the database trigger applies. `exceptId` protects the resource being finalized.
 */
export async function releaseExpiredReservations(
  tx: DbTx,
  userId: string,
  now: Date,
  exceptId?: string,
): Promise<number> {
  const released = await tx.execute<{ id: string }>(sql`
    update public.resources
    set deleted_at = ${now.toISOString()}::timestamptz
    where owner_id = ${userId}::uuid
      and deleted_at is null
      and size_bytes is null
      and metadata -> 'upload' ->> 'reservedUntil' is not null
      and (metadata -> 'upload' ->> 'reservedUntil')::timestamptz <= ${now.toISOString()}::timestamptz
      and id <> ${exceptId ?? NO_RESOURCE}::uuid
    returning id::text as id
  `);
  return released.length;
}

/** Finalized bytes plus the reservations still alive, the resource `exceptId` left out (ET-3). */
export async function usedBytes(
  tx: DbTx,
  userId: string,
  now: Date,
  exceptId?: string,
): Promise<number> {
  const rows = await tx.execute<{ used: number }>(sql`
    select (
      coalesce(sum(r.size_bytes) filter (where r.size_bytes is not null), 0)
      + coalesce(
          sum((r.metadata -> 'upload' ->> 'declaredBytes')::float8)
            filter (
              where r.size_bytes is null
                and r.metadata -> 'upload' ->> 'declaredBytes' is not null
                and (r.metadata -> 'upload' ->> 'reservedUntil')::timestamptz > ${now.toISOString()}::timestamptz
            ),
          0
        )
    )::float8 as used
    from public.resources r
    where r.owner_id = ${userId}::uuid
      and r.deleted_at is null
      and r.id <> ${exceptId ?? NO_RESOURCE}::uuid
  `);
  return rows[0]?.used ?? 0;
}

export async function chapterResourceCount(
  tx: DbTx,
  userId: string,
  chapterId: string,
  exceptId?: string,
): Promise<number> {
  const rows = await tx.execute<{ total: number }>(sql`
    select count(*)::int as total
    from public.resources r
    where r.owner_id = ${userId}::uuid
      and r.chapter_id = ${chapterId}::uuid
      and r.deleted_at is null
      and r.id <> ${exceptId ?? NO_RESOURCE}::uuid
  `);
  return rows[0]?.total ?? 0;
}

/** ET-4 — a creation replayed with the same key finds its resource again instead of a new one. */
export async function findByIdempotencyKey(
  tx: DbTx,
  userId: string,
  key: string,
): Promise<ResourceRow | null> {
  const rows = await tx.execute<ResourceRow>(sql`
    select ${RESOURCE_COLUMNS}
    from public.resources r
    where r.owner_id = ${userId}::uuid
      and r.deleted_at is null
      and r.metadata -> 'upload' ->> 'idempotencyKey' = ${key}
    limit 1
  `);
  return rows[0] ?? null;
}

/** Soft deletion of an upload that was refused or abandoned: it no longer counts anywhere. */
export async function discardResource(tx: DbTx, resourceId: string, now: Date): Promise<void> {
  await tx.execute(sql`
    update public.resources
    set deleted_at = ${now.toISOString()}::timestamptz
    where id = ${resourceId}::uuid and deleted_at is null
  `);
}

const LIMIT_TRIGGER_MESSAGES: Record<string, { code: string; message: string }> = {
  resource_pdf_limit: {
    code: 'UPLOAD_TOO_LARGE',
    message: 'Ce PDF dépasse la taille ou le nombre de pages autorisés.',
  },
  resource_image_limit: {
    code: 'UPLOAD_TOO_LARGE',
    message: 'Cette image dépasse la taille autorisée.',
  },
  chapter_resource_limit: {
    code: 'QUOTA_EXCEEDED',
    message: 'Ce chapitre a atteint le nombre maximal d’apports.',
  },
  storage_quota_exceeded: {
    code: 'QUOTA_EXCEEDED',
    message: 'Votre espace de stockage est plein.',
  },
};

const LIMIT_CONSTRAINTS = ['resources_pdf_size', 'resources_image_size', 'resources_pdf_pages'];

/**
 * Defence in depth (SPEC-104 EF-3): the database refuses what slipped past the service with a
 * stable message; it is turned into the same business codes the service answers.
 */
export function translateLimitError(error: unknown): unknown {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const known = LIMIT_TRIGGER_MESSAGES[current.message];
    if (known !== undefined) return new AppError(known.code, known.message, { cause: error });
    if (
      LIMIT_CONSTRAINTS.some((name) => current instanceof Error && current.message.includes(name))
    ) {
      return new AppError('UPLOAD_TOO_LARGE', 'Le fichier dépasse les limites autorisées.', {
        cause: error,
      });
    }
    current = (current as { cause?: unknown }).cause;
  }
  return error;
}
