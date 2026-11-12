import { pushSubscriptionsDelete, pushSubscriptionsUpsert } from '@learny/contracts';
import { removePushSubscription, upsertPushSubscription } from '@learny/notifications/push';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-205 EF-1: registers or refreshes the Web Push subscription of the current browser, under the
// Row Level Security client of the session (one endpoint, one account).
export const POST = handler(pushSubscriptionsUpsert, ({ ctx, body }) =>
  upsertPushSubscription(ctx, body),
);

// SPEC-205 EF-2: removes the subscription of the current browser; repeated removals answer 204.
export const DELETE = handler(pushSubscriptionsDelete, async ({ ctx, body }) => {
  const result = await removePushSubscription(ctx, body);
  return result.ok ? undefined : result;
});
