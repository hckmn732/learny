// BR-APP-10 — rename a contribution without touching its passages or citations (SPEC-607 EF-3).
//
// The row is read and updated under the caller's RLS client: another owner is the same NOT_FOUND
// as an unknown resource. `expectedUpdatedAt` is the version the screen displayed (CL-2); a stale
// value is refused with the current state instead of overwriting a concurrent change. Repeating the
// same title is a success and does not move `updated_at`.
import {
  RenameResourceBody,
  type RenameResourceOutput,
  type ResourceStatus,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';

import type { ServiceContext } from '../context';

import { requireUser, toResult } from './result';

interface RenameRow extends Record<string, unknown> {
  id: string;
  title: string;
  status: string;
  updated_at: Date;
}

export function renameResource(
  ctx: ServiceContext,
  resourceId: string,
  input: RenameResourceBody,
): Promise<Result<RenameResourceOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx): Promise<RenameResourceOutput> => {
      const rows = await tx.execute<RenameRow>(sql`
        select r.id::text as id, r.title, r.status::text as status, r.updated_at
        from public.resources r
        where r.id = ${resourceId}::uuid
          and r.owner_id = ${userId}::uuid
          and r.deleted_at is null
        for update
      `);
      const row = rows[0];
      if (row === undefined) {
        throw new AppError('NOT_FOUND', 'Apport introuvable.');
      }
      const current: RenameResourceOutput = {
        id: row.id,
        title: row.title,
        status: row.status as ResourceStatus,
        updatedAt: row.updated_at.toISOString(),
      };
      if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== current.updatedAt) {
        throw new AppError(
          'CONFLICT',
          'Cet apport a changé entre-temps : le titre actuel est restitué.',
          {
            status: 409,
            errors: [{ path: 'body.expectedUpdatedAt', message: `Version actuelle : ${current.updatedAt}` }],
          },
        );
      }
      if (input.title === row.title) return current;

      const now = ctx.clock.now();
      const updated = await tx.execute<RenameRow>(sql`
        update public.resources r
        set title = ${input.title}, updated_at = ${now.toISOString()}::timestamptz
        where r.id = ${resourceId}::uuid
          and r.owner_id = ${userId}::uuid
          and r.deleted_at is null
        returning r.id::text as id, r.title, r.status::text as status, r.updated_at
      `);
      const result = updated[0];
      if (result === undefined) {
        throw new AppError('CONFLICT', 'L’apport a été modifié en parallèle : réessayez.');
      }
      return {
        id: result.id,
        title: result.title,
        status: result.status as ResourceStatus,
        updatedAt: result.updated_at.toISOString(),
      };
    });
  });
}
