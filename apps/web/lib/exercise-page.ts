import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import type { PracticeExerciseDto } from '@learny/contracts';
import { createServiceContext, getPracticeExercise } from '@learny/services';

import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type ExercisePageResult =
  { ok: true; data: PracticeExerciseDto } | { ok: false; requestId?: string };

/**
 * Server read of SCR-08 (SPEC-613). The page and the API call the same service under the learner's
 * session; an exercise of another learner (or of another module/formation) is a 404.
 */
export async function loadPracticeExercisePage(
  formationId: string,
  moduleId: string,
  exerciseId: string,
): Promise<ExercisePageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const result = await getPracticeExercise(ctx, { formationId, moduleId, exerciseId });
  if (result.ok) return { ok: true, data: result.value };
  if (result.error.code === 'NOT_FOUND') notFound();
  return result.error.requestId === undefined
    ? { ok: false }
    : { ok: false, requestId: result.error.requestId };
}
