// Removal of a resource's blob from Storage (SPEC-206 ET-6, CL-8).
//
// The database side (soft deletion, passages, citations) is already committed when this runs, so
// the resource is unreachable whatever happens here. A failure is not an error for the caller: the
// blob stays marked as pending (`metadata.upload.blobRemovedAt` absent) and `purgeDeletedBlobs`
// picks it up again. Removing an already missing object succeeds (SPEC-114 gateway), which makes
// every retry idempotent.
import { clock as defaultClock, type Clock, type LearnyLogger } from '@learny/core';
import { deleteStoredObject, serviceDb, sql } from '@learny/db';

import type { ResourceDeps } from './deps';

export interface BlobTarget {
  resourceId: string;
  ownerId: string;
  path: string;
}

export interface BlobContext {
  clock?: Clock;
  logger: LearnyLogger;
}

/** `true` when the object is gone and the marker is written; `false` when it must be retried. */
export async function removeBlob(
  ctx: BlobContext,
  deps: ResourceDeps,
  target: BlobTarget,
): Promise<boolean> {
  const clock = ctx.clock ?? defaultClock;
  try {
    // `service` role: the row is already soft-deleted, so the ownership check of the user role
    // (which looks for a live row) cannot apply; the owner id is the one stored on the row.
    await deleteStoredObject(
      { db: serviceDb(), gateway: deps.gateway, clock },
      {
        userId: target.ownerId,
        accessToken: deps.accessToken(target.ownerId),
        role: 'service',
      },
      { bucket: 'resources', path: target.path },
    );
    await serviceDb().execute(sql`
      update public.resources
      set metadata = jsonb_set(
        metadata,
        '{upload}',
        coalesce(metadata -> 'upload', '{}'::jsonb)
          || jsonb_build_object('blobRemovedAt', ${clock.now().toISOString()}::text)
      )
      where id = ${target.resourceId}::uuid
    `);
    return true;
  } catch (error) {
    ctx.logger.warn(
      'blob removal deferred',
      { operation: 'resource.blob-removal', outcome: 'deferred' },
      error,
    );
    return false;
  }
}
