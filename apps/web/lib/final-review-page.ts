import { notFound, redirect } from 'next/navigation';

import type { FinalReviewDto } from '@learny/contracts';

import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type FinalReviewPageResult =
  { ok: true; data: FinalReviewDto } | { ok: false; requestId?: string };

/**
 * Server read of SCR-16 (SPEC-617 EF-1, ET-5). The page and the API call the same service under
 * the learner's session: a foreign formation is a 404, a formation whose modules are not all
 * validated redirects to its programme instead of showing an anticipated bilan.
 */
export async function loadFinalReviewPage(formationId: string): Promise<FinalReviewPageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  try {
    const client = await serverApi();
    return {
      ok: true,
      data: await client.api.getFinalReview({ params: { fid: formationId } }),
    };
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    if (isApiError(error, 'CONFLICT')) {
      redirect(`/formations/${encodeURIComponent(formationId)}/programme`);
    }
    const requestId = apiErrorRequestId(error);
    return requestId === undefined ? { ok: false } : { ok: false, requestId };
  }
}
