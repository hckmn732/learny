import { meNotificationSettingsGet, meNotificationSettingsUpdate } from '@learny/contracts';
import { getNotificationSettings, updateNotificationSettings } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-708 ET-3 — the Notifications tab reads and patches its settings under the learner's own
// RLS client; the PATCH is partial and idempotent, and never touches the push subscriptions.
export const GET = handler(meNotificationSettingsGet, ({ ctx }) => getNotificationSettings(ctx));

export const PATCH = handler(meNotificationSettingsUpdate, ({ ctx, body }) =>
  updateNotificationSettings(ctx, body),
);
