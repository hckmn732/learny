import { notFound, redirect } from 'next/navigation';

import type { PracticeExerciseDto } from '@learny/contracts';

import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';
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
  try {
    const client = await serverApi();
    return {
      ok: true,
      data: await client.api.exerciseDetail({
        params: { fid: formationId, mid: moduleId, aid: exerciseId },
      }),
    };
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    const requestId = apiErrorRequestId(error);
    return requestId === undefined ? { ok: false } : { ok: false, requestId };
  }
}
