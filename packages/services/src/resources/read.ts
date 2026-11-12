// EF-4 — signed read URL of a finalized file (SPEC-206, CL-5, CL-7).
//
// The row is read under the caller's identity: another owner's resource is invisible to Row Level
// Security, so a group member never reaches it. SPEC-114 then signs ten minutes after re-checking
// the row. A new call gives a new URL; an expired one is never extended. The URL is returned and
// forgotten: it is neither logged nor stored (ET-4).
import type { ReadUrlOutput } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { createReadUrl } from '@learny/db';

import type { ServiceContext } from '../context';

import type { ResourceDeps } from './deps';
import { denyOrMissing, selectResource } from './queries';
import { requireUser, toResult } from './result';

export function getSignedReadUrl(
  ctx: ServiceContext,
  deps: ResourceDeps,
  resourceId: string,
): Promise<Result<ReadUrlOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx): Promise<ReadUrlOutput> => {
      const row = await selectResource(tx, resourceId);
      if (row === null) return denyOrMissing('resources', resourceId);
      if (
        row.deleted_at !== null ||
        row.storage_path === null ||
        row.size_bytes === null ||
        (row.kind !== 'pdf' && row.kind !== 'image')
      ) {
        // A deleted resource, a note or a file that was never finalized has nothing to read.
        throw new AppError('NOT_FOUND', 'Aucun fichier n’est disponible pour cet apport.');
      }
      const signed = await createReadUrl(
        { db: tx, gateway: deps.gateway, clock: ctx.clock },
        { userId, accessToken: deps.accessToken(userId), role: 'user' },
        { bucket: 'resources', path: row.storage_path },
      );
      return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
    });
  });
}
