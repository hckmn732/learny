import { redirect } from 'next/navigation';

import type { NotificationSettingsDto } from '@learny/contracts';

import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';
import { SIGN_IN_PATH } from './route-guard';
import { readPageSession } from './supabase/page';

export type NotificationSettingsPageResult =
  { ok: true; data: NotificationSettingsDto } | { ok: false; requestId?: string };

/** Server-rendered Notifications tab of the settings screen (SPEC-708 EF-1 to EF-3, ET-3). */
export async function loadNotificationSettingsPage(): Promise<NotificationSettingsPageResult> {
  const session = await readPageSession();
  if (session === null) {
    return { ok: false };
  }
  try {
    const client = await serverApi();
    return { ok: true, data: await client.api.meNotificationSettingsGet({}) };
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    const requestId = apiErrorRequestId(error);
    return requestId === undefined ? { ok: false } : { ok: false, requestId };
  }
}
