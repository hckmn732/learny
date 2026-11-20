import { pushSubscriptionsDelete, pushSubscriptionsUpsert } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { removePushSubscription, upsertPushSubscription } from '@learny/notifications/push';

// SPEC-1004 ET-1 - implementations of the `push` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const pushImplementations = {
  pushSubscriptionsUpsert: ({ ctx, body }: HandlerArgs<typeof pushSubscriptionsUpsert>) =>
    upsertPushSubscription(ctx, body),
  pushSubscriptionsDelete: async ({ ctx, body }: HandlerArgs<typeof pushSubscriptionsDelete>) => {
    const result = await removePushSubscription(ctx, body);
    return result.ok ? undefined : result;
  },
};
