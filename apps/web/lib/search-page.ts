import { randomUUID } from 'node:crypto';

import { redirect } from 'next/navigation';

import { createServiceContext } from '@learny/services';

import { SIGN_IN_PATH } from './route-guard';
import { searchPageForContext, type SearchPageState } from './search-data';
import { readPageSession } from './supabase/page';

/**
 * Page data of SCR-18 (SPEC-307 ET-3): the session learner runs the shared SPEC-212 service
 * server-side, under Row Level Security. The proxy already protects `/recherche`; the redirect is
 * the server-component safety net when the session expires between the proxy and the render.
 */
export async function loadSearchPage(rawQuery: string): Promise<SearchPageState> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  return searchPageForContext(ctx, rawQuery);
}
