import { redirect } from 'next/navigation';

import type { SettingsState } from '@learny/contracts';

import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type SettingsPageResult =
  { ok: true; data: SettingsState } | { ok: false; requestId?: string };

/** Server-rendered settings state of the authenticated learner (SPEC-707 EF-2, EF-4). */
export async function loadSettingsPage(): Promise<SettingsPageResult> {
  const session = await readPageSession();
  if (session === null) {
    return { ok: false };
  }
  try {
    const client = await serverApi();
    return { ok: true, data: await client.api.meProfileGet({}) };
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    const requestId = apiErrorRequestId(error);
    return requestId === undefined ? { ok: false } : { ok: false, requestId };
  }
}
