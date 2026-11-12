// Sending one committed delivery (SPEC-209 ET-4, EF-7). The event `notification/delivery-due` is
// emitted in the notify transaction through the outbox; this function is idempotent on the
// delivery identifier, and the three Inngest retries cover a transient e-mail failure.
import { deliverDelivery } from '@learny/notifications';

import { defineFunction } from '../define';

export const NOTIFICATION_DELIVERY_ID = 'notification-delivery';

export const notificationDelivery = defineFunction(
  {
    id: NOTIFICATION_DELIVERY_ID,
    trigger: { event: 'notification/delivery-due' },
    idempotency: 'event.data.deliveryId',
    concurrency: { key: 'event.data.userId', limit: 5 },
  },
  async ({ event, step, ctx }) => {
    const outcome = await step.run('deliver', async () => {
      const result = await deliverDelivery(
        ctx,
        event.data.deliveryId,
        {},
        {
          ...(event.data.data === undefined ? {} : { data: event.data.data }),
        },
      );
      if (!result.ok) throw result.error;
      return result.value;
    });
    return outcome;
  },
);
