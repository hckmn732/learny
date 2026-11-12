// EF-5 — deletion of a contribution that keeps the history of its citations (SPEC-206).
//
// One database transaction soft-deletes the resource, removes its passages (the citations that
// pointed at them keep their row with `chunk_id = null`, by the foreign key) and relabels those
// citations « source supprimée » (ADR-0039, BR-APP-10). The resource is unreachable from that
// commit on. The Storage blob is removed afterwards and, if Storage fails, later by
// `purgeDeletedBlobs` (ET-6, CL-8). Repeating the deletion is a success that retries the cleanup.
//
// The transaction runs as the table owner because the `authenticated` role cannot delete passages
// (no policy, SPEC-104): ownership is verified first under the caller's identity.
import { AppError, type Result } from '@learny/core';
import { serviceDb, sql } from '@learny/db';

import type { ServiceContext, SystemContext } from '../context';

import { removeBlob } from './blob';
import type { ResourceDeps } from './deps';
import { DELETED_SOURCE_LABEL } from './limits';
import { denyOrMissing, lockOwner, selectResource } from './queries';
import { requireUser, toResult } from './result';

export function deleteResource(
  ctx: ServiceContext,
  deps: ResourceDeps,
  resourceId: string,
): Promise<Result<undefined>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const row = await db.run((tx) => selectResource(tx, resourceId));
    if (row === null) return denyOrMissing('resources', resourceId);

    await serviceDb().transaction(async (tx) => {
      await lockOwner(tx, userId);
      await tx.execute(sql`
        update public.resources
        set deleted_at = ${ctx.clock.now().toISOString()}::timestamptz
        where id = ${resourceId}::uuid and owner_id = ${userId}::uuid and deleted_at is null
      `);
      // The trigger of SPEC-104 deleted the passages; the citations keep their quote and location.
      await tx.execute(sql`
        update public.citations
        set chunk_id = null, label = ${DELETED_SOURCE_LABEL}
        where resource_id = ${resourceId}::uuid and owner_id = ${userId}::uuid
      `);
    });

    const pending = row.storage_path !== null && row.metadata.upload?.blobRemovedAt === undefined;
    if (pending && row.storage_path !== null) {
      await removeBlob(ctx, deps, { resourceId, ownerId: userId, path: row.storage_path });
    }
    return undefined;
  });
}

interface PendingBlob extends Record<string, unknown> {
  id: string;
  owner_id: string;
  storage_path: string;
}

export interface PurgeResult {
  removed: number;
  failed: number;
}

/**
 * ET-6, CL-8 — resumes the removal of the blobs of deleted resources whose Storage call failed (or
 * never ran). Idempotent: a missing object counts as removed. Meant for a job (SPEC-203 cron) and
 * safe to call at any time.
 */
export async function purgeDeletedBlobs(
  ctx: SystemContext,
  deps: ResourceDeps,
  options: { limit?: number; ownerId?: string } = {},
): Promise<PurgeResult> {
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new AppError('VALIDATION_FAILED', 'La limite de nettoyage doit être entre 1 et 1000.');
  }
  const pending = await ctx.sdb.execute<PendingBlob>(sql`
    select id::text as id, owner_id::text as owner_id, storage_path
    from public.resources
    where deleted_at is not null
      and storage_path is not null
      and metadata -> 'upload' ->> 'blobRemovedAt' is null
      and (${options.ownerId ?? null}::uuid is null or owner_id = ${options.ownerId ?? null}::uuid)
    order by deleted_at
    limit ${limit}
  `);
  const result: PurgeResult = { removed: 0, failed: 0 };
  for (const blob of pending) {
    const removed = await removeBlob(ctx, deps, {
      resourceId: blob.id,
      ownerId: blob.owner_id,
      path: blob.storage_path,
    });
    if (removed) result.removed += 1;
    else result.failed += 1;
  }
  return result;
}
