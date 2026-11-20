import { redirect } from 'next/navigation';

import type { AiModelsState } from '@learny/contracts';

import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type AiModelsPageResult =
  { ok: true; data: AiModelsState } | { ok: false; requestId?: string };

/** Server-rendered « Modèles d'IA » tab of the settings screen (SPEC-709 EF-1, EF-2). */
export async function loadAiModelsPage(): Promise<AiModelsPageResult> {
  const session = await readPageSession();
  if (session === null) {
    return { ok: false };
  }
  try {
    const client = await serverApi();
    return { ok: true, data: await client.api.meAiModelsGet({}) };
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    const requestId = apiErrorRequestId(error);
    return requestId === undefined ? { ok: false } : { ok: false, requestId };
  }
}
