// Single emission of `resource/uploaded` (SPEC-206 EF-2, CL-4, ET-5).
//
// The event is sent after the finalization committed, never inside its transaction. A claim on the
// row (`metadata.upload.eventClaimedAt`) makes one caller the sender: concurrent finalizations and
// repeated ones see the claim or the `eventEmittedAt` mark and do nothing. A failed send releases
// the claim and reports `SERVICE_UNAVAILABLE`, so repeating the (idempotent) finalization sends it;
// a claim whose sender crashed becomes claimable again after a minute. The stable event id lets the
// platform deduplicate the rare double delivery that remains.
import { AppError } from '@learny/core';
import { sql, type UserDatabase } from '@learny/db';

import type { ServiceContext } from '../context';

import { uploadedEventId, type ResourceDeps } from './deps';
import type { ResourceRow } from './queries';

/** A claim older than this is considered abandoned by a crashed sender. */
export const EVENT_CLAIM_STALE_MS = 60_000;

export async function ensureUploadedEvent(
  ctx: ServiceContext,
  deps: ResourceDeps,
  db: UserDatabase,
  row: ResourceRow,
): Promise<void> {
  const now = ctx.clock.now();
  const staleBefore = new Date(now.getTime() - EVENT_CLAIM_STALE_MS);
  const claimed = await db.run((tx) =>
    tx.execute<{ id: string }>(sql`
      update public.resources
      set metadata = jsonb_set(
        metadata,
        '{upload,eventClaimedAt}',
        to_jsonb(${now.toISOString()}::text)
      )
      where id = ${row.id}::uuid
        and owner_id = ${row.owner_id}::uuid
        and deleted_at is null
        and size_bytes is not null
        and metadata -> 'upload' ->> 'eventEmittedAt' is null
        and (
          metadata -> 'upload' ->> 'eventClaimedAt' is null
          or (metadata -> 'upload' ->> 'eventClaimedAt')::timestamptz < ${staleBefore.toISOString()}::timestamptz
        )
      returning id::text as id
    `),
  );
  if (claimed.length === 0) return;

  try {
    await deps.events.emitUploaded(
      {
        userId: row.owner_id,
        resourceId: row.id,
        formationId: row.formation_id,
        chapterId: row.chapter_id,
        kind: row.kind,
      },
      { id: uploadedEventId(row.id) },
    );
  } catch (error) {
    await db.run((tx) =>
      tx.execute(sql`
        update public.resources
        set metadata = metadata #- '{upload,eventClaimedAt}'
        where id = ${row.id}::uuid and owner_id = ${row.owner_id}::uuid
      `),
    );
    ctx.logger.error(
      'resource event not sent',
      { operation: 'resource.uploaded-event', outcome: 'failed' },
      error,
    );
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      'Le traitement de l’apport n’a pas pu être lancé : réessayez dans un instant.',
      { cause: error },
    );
  }

  await db.run((tx) =>
    tx.execute(sql`
      update public.resources
      set metadata = jsonb_set(
        metadata,
        '{upload,eventEmittedAt}',
        to_jsonb(${now.toISOString()}::text)
      )
      where id = ${row.id}::uuid and owner_id = ${row.owner_id}::uuid
    `),
  );
}
