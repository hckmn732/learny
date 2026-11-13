// Grading of a stored brick version (SPEC-502 ET-6). Read-only: the route or the engine persists
// the attempt (SPEC-611, SPEC-701). RLS applies through the user client; a version of another
// learner is a 404, never a hint that it exists.
import { z } from 'zod';

import { gradeBrick, parseBrickPayload, type BrickType, type GradeOutcome } from '@learny/bricks';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

interface VersionRow {
  [key: string]: unknown;
  versionId: string;
  type: BrickType;
  payload: unknown;
}

async function readableVersion(
  tx: DbTx,
  userId: string,
  versionId: string,
): Promise<VersionRow | undefined> {
  const rows = await tx.execute<VersionRow>(sql`
    select
      v.id::text as "versionId",
      b.type::text as "type",
      v.payload as "payload"
    from public.brick_versions v
    join public.bricks b on b.id = v.brick_id
    where v.id = ${versionId}::uuid and b.owner_id = ${userId}::uuid
  `);
  return rows[0];
}

/**
 * Corrects one response against the immutable version payload. The seed is the version id, so the
 * opaque ids of `getPublicBrick` are rebuilt exactly (ADR-0150).
 */
export async function gradeStoredBrick(
  ctx: ServiceContext,
  versionId: string,
  response: unknown,
): Promise<Result<GradeOutcome>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const id = z.uuid().safeParse(versionId);
    if (!id.success) throw new AppError('VALIDATION_FAILED', 'Identifiant de version invalide.');

    return db.run(async (tx) => {
      const row = await readableVersion(tx, userId, id.data);
      if (row === undefined) {
        throw new AppError('NOT_FOUND', 'Version de brique introuvable.');
      }
      const parsed = parseBrickPayload(row.type, row.payload);
      if (!parsed.ok) {
        throw new AppError('INTERNAL_ERROR', 'La charge stockée de la brique est invalide.');
      }

      const graded = gradeBrick(row.type, parsed.value, response, row.versionId);
      if (graded.ok) return graded.value;

      if (graded.error.code === 'GRADED_BY_TUTOR') {
        throw new AppError(
          'GRADED_BY_TUTOR',
          'Cette brique est corrigée par le tuteur, pas par le code.',
        );
      }
      throw new AppError('RESPONSE_INVALID', 'La réponse envoyée est invalide.', {
        errors: graded.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    });
  });
}
