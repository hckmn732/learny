import { AppError, err, ok, type Result } from '@learny/core';
import { sql } from '@learny/db';

import type { ServiceContext } from '../context';

// Guards evaluated before creating a validation attempt (SPEC-611 ET-6, BR-FOR-08). SPEC-612 adds
// the retry-delay guard to the same registry: the service only composes them.

export interface QuizAttemptGuardContext {
  userId: string;
  moduleId: string;
  formationId: string;
  status: 'locked' | 'open' | 'validated';
}

export type QuizAttemptGuard = (
  ctx: ServiceContext,
  moduleId: string,
) => Promise<Result<void>>;

/** BR-FOR-08, CL-7 — a locked module never opens, even from a hand-written URL. */
export const moduleOpenGuard: QuizAttemptGuard = async (ctx, moduleId) => {
  if (ctx.userId === null || ctx.db === null) {
    return err(new AppError('UNAUTHENTICATED', 'Vous devez être connecté pour passer un quiz.'));
  }
  const userId = ctx.userId;
  const db = ctx.db;
  const rows = await db.run((tx) =>
    tx.execute<{ status: string }>(sql`
      select coalesce(mp.status, m.status)::text as status
      from public.modules m
      left join public.module_progress mp
        on mp.module_id = m.id and mp.user_id = ${userId}::uuid
      where m.id = ${moduleId}::uuid
      limit 1
    `),
  );
  const status = rows[0]?.status;
  if (status === undefined) {
    return err(new AppError('NOT_FOUND', 'Module introuvable.'));
  }
  if (status === 'locked') {
    return err(
      new AppError('MODULE_LOCKED', 'Ce module est verrouillé.', { status: 422 }),
    );
  }
  return ok(undefined);
};

/** Registry extended by SPEC-612; SPEC-611 registers only the open-module guard (ET-6). */
export const quizAttemptGuards: QuizAttemptGuard[] = [moduleOpenGuard];
