import { randomUUID } from 'node:crypto';

import type { NotificationSettingsDto } from '@learny/contracts';
import { AppError } from '@learny/core';
import { createServiceContext, getNotificationSettings } from '@learny/services';

import { readPageSession } from './supabase/page';

export type NotificationSettingsPageResult =
  { ok: true; data: NotificationSettingsDto } | { ok: false; requestId?: string };

/** Server-rendered Notifications tab of the settings screen (SPEC-708 EF-1 to EF-3, ET-3). */
export async function loadNotificationSettingsPage(): Promise<NotificationSettingsPageResult> {
  const session = await readPageSession();
  if (session === null) {
    return { ok: false };
  }
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const result = await getNotificationSettings(ctx);
  if (result.ok) return { ok: true, data: result.value };
  const error: AppError = result.error;
  return error.requestId === undefined ? { ok: false } : { ok: false, requestId: error.requestId };
}
