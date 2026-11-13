import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import type { FinalReviewDto } from '@learny/contracts';
import { createServiceContext, getFinalReview } from '@learny/services';

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
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const result = await getFinalReview(ctx, formationId);
  if (result.ok) return { ok: true, data: result.value };
  if (result.error.code === 'NOT_FOUND') notFound();
  if (result.error.code === 'CONFLICT') {
    redirect(`/formations/${encodeURIComponent(formationId)}/programme`);
  }
  return result.error.requestId === undefined
    ? { ok: false }
    : { ok: false, requestId: result.error.requestId };
}
