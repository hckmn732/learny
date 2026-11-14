import { randomUUID } from 'node:crypto';

import type { SettingsState } from '@learny/contracts';
import { AppError } from '@learny/core';
import { createServiceContext, getSettingsState } from '@learny/services';

import { readPageSession } from './supabase/page';

export type SettingsPageResult =
  { ok: true; data: SettingsState } | { ok: false; requestId?: string };

/** Server-rendered settings state of the authenticated learner (SPEC-707 EF-2, EF-4). */
export async function loadSettingsPage(): Promise<SettingsPageResult> {
  const session = await readPageSession();
  if (session === null) {
    return { ok: false };
  }
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const result = await getSettingsState(ctx);
  if (result.ok) return { ok: true, data: result.value };
  const error: AppError = result.error;
  return error.requestId === undefined ? { ok: false } : { ok: false, requestId: error.requestId };
}
