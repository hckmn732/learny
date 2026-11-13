import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import type { GapListDto, GapNature } from '@learny/contracts';
import { createServiceContext, listGaps } from '@learny/services';

import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type GapsPageResult = { ok: true; data: GapListDto } | { ok: false; requestId?: string };

/**
 * Server read of SCR-13 (SPEC-615). The page and the API call the same service under the learner's
 * session; a formation of another learner is a 404, not an empty page. `nature` is already parsed
 * by the page so an unknown value falls back to « Toutes » without a failed request.
 */
export async function loadGapsPage(
  formationId: string,
  nature: GapNature | undefined,
): Promise<GapsPageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const result = await listGaps(ctx, { formationId, nature: nature ?? null });
  if (result.ok) return { ok: true, data: result.value };
  if (result.error.code === 'NOT_FOUND') notFound();
  return result.error.requestId === undefined
    ? { ok: false }
    : { ok: false, requestId: result.error.requestId };
}
