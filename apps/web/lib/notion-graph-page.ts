import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import type { NotionGraphDto } from '@learny/contracts';
import { createServiceContext, getNotionGraph } from '@learny/services';

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
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const result = await getNotionGraph(ctx, { formationId });
  if (result.ok) return { ok: true, data: result.value };
  if (result.error.code === 'NOT_FOUND') notFound();
  return result.error.requestId === undefined
    ? { ok: false }
    : { ok: false, requestId: result.error.requestId };
}
