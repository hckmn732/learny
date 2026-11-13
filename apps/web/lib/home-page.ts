import { randomUUID } from 'node:crypto';

import type { HomeDto } from '@learny/contracts';
import { AppError } from '@learny/core';
import { createServiceContext, getHome } from '@learny/services';

import { readPageSession } from './supabase/page';

export type HomePageResult = { ok: true; data: HomeDto } | { ok: false; requestId?: string };

/** Server-rendered home data of the authenticated learner (SPEC-603 EF-10). */
export async function loadHomePage(): Promise<HomePageResult> {
  const session = await readPageSession();
  if (session === null) {
    return { ok: false };
  }
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const result = await getHome(ctx);
  if (result.ok) return { ok: true, data: result.value };
  const error: AppError = result.error;
  return error.requestId === undefined ? { ok: false } : { ok: false, requestId: error.requestId };
}
