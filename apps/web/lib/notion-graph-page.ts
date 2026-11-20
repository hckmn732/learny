import { notFound, redirect } from 'next/navigation';

import type { NotionGraphDto } from '@learny/contracts';

import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type NotionGraphPageResult =
  { ok: true; data: NotionGraphDto } | { ok: false; requestId?: string };

/**
 * Server read of SCR-14 (SPEC-616). The page and the API call the same service under the learner's
 * session; a formation of another learner is a 404, not an empty graph.
 */
export async function loadNotionGraphPage(formationId: string): Promise<NotionGraphPageResult> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  try {
    const client = await serverApi();
    return {
      ok: true,
      data: await client.api.notionGraph({ params: { fid: formationId } }),
    };
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    const requestId = apiErrorRequestId(error);
    return requestId === undefined ? { ok: false } : { ok: false, requestId };
  }
}
