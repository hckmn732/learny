// Nightly purge of expired personal-data exports (SPEC-211 EF-8).
//
// An archive is removed from the private bucket once its expiration is older than 24 hours; the
// row goes with it. A missing blob counts as removed (idempotent step), and a page opened after the
// expiration but before the purge still answers 410 (CL-4).
import { deleteDataExport, listExpiredDataExports, serviceDb } from '@learny/db';

import type { JobContext } from '../context';
import type { StepRunner } from '../functions/data-export';

import { defaultDeletionDeps, type DeletionDeps } from './deps';

export const EXPORT_PURGE_GRACE_MS = 24 * 60 * 60 * 1000;

export interface PurgeOutcome {
  rows: number;
  objects: number;
}

export async function runExportsPurge(
  args: { ctx: JobContext; step: StepRunner },
  deps: DeletionDeps = defaultDeletionDeps(),
): Promise<PurgeOutcome> {
  const { ctx, step } = args;
  return step.run('exports-purge', async () => {
    const before = new Date(ctx.clock.now().getTime() - EXPORT_PURGE_GRACE_MS);
    const expired = await serviceDb().transaction((tx) => listExpiredDataExports(tx, { before }));
    let objects = 0;
    for (const row of expired) {
      if (row.storagePath !== null && row.storagePath !== '') {
        await deps.removeObject('exports', row.storagePath);
        objects += 1;
      }
      await serviceDb().transaction((tx) =>
        deleteDataExport(tx, { userId: row.userId, exportId: row.id }),
      );
    }
    return { rows: expired.length, objects };
  });
}
