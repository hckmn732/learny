import { redirect } from 'next/navigation';

import { isApiError } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { searchPageForApi, type SearchPageState } from './search-data';
import { readPageSession } from './supabase/page';

/**
 * Page data of SCR-18 (SPEC-307 ET-3): the session learner runs the shared SPEC-212 service
 * server-side, under Row Level Security. The proxy already protects `/recherche`; the redirect is
 * the server-component safety net when the session expires between the proxy and the render.
 */
export async function loadSearchPage(rawQuery: string): Promise<SearchPageState> {
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  try {
    return await searchPageForApi(rawQuery);
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    throw error;
  }
}
