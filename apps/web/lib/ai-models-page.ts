import { randomUUID } from 'node:crypto';

import type { AiModelsState } from '@learny/contracts';
import { AppError } from '@learny/core';
import { createServiceContext, getAiModelsState } from '@learny/services';

import { readPageSession } from './supabase/page';

export type AiModelsPageResult =
  { ok: true; data: AiModelsState } | { ok: false; requestId?: string };

/** Server-rendered « Modèles d'IA » tab of the settings screen (SPEC-709 EF-1, EF-2). */
export async function loadAiModelsPage(): Promise<AiModelsPageResult> {
  const session = await readPageSession();
  if (session === null) {
    return { ok: false };
  }
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const result = await getAiModelsState(ctx);
  if (result.ok) return { ok: true, data: result.value };
  const error: AppError = result.error;
  return error.requestId === undefined ? { ok: false } : { ok: false, requestId: error.requestId };
}
