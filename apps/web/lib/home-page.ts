import { redirect } from 'next/navigation';

import type { HomeDto } from '@learny/contracts';

import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type HomePageResult = { ok: true; data: HomeDto } | { ok: false; requestId?: string };

/** Server-rendered home data of the authenticated learner (SPEC-603 EF-10). */
export async function loadHomePage(): Promise<HomePageResult> {
  const session = await readPageSession();
  if (session === null) {
    return { ok: false };
  }
  try {
    const client = await serverApi();
    return { ok: true, data: await client.api.homeGet({}) };
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    const requestId = apiErrorRequestId(error);
    return requestId === undefined ? { ok: false } : { ok: false, requestId };
  }
}
