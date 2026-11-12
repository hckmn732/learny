// Re-evaluation of the deferred deliveries (SPEC-209 EF-5, ET-6, ADR-0214). After every hourly
// tick, every `scheduled` or `deferred_quiet` delivery whose instant is reached is decided again by
// the same controls and sent at most once: `deliverDelivery` never reopens a `sent` line (CA-4).
import { deliverDelivery, listDueDeliveries } from '@learny/notifications';

import { defineFunction } from '../define';

export const NOTIFICATIONS_DEFERRED_DUE_ID = 'notifications-deferred-due';
export const DEFERRED_DUE_BATCH = 100;

export const notificationsDeferredDue = defineFunction(
  {
    id: NOTIFICATIONS_DEFERRED_DUE_ID,
    trigger: { event: 'cron/hourly-tick' },
    idempotency: 'event.data.tickAt',
    retries: 1,
  },
  async ({ step, ctx, logger }) => {
    const due = await step.run('list-due', () =>
      listDueDeliveries(ctx, ctx.clock.now(), DEFERRED_DUE_BATCH),
    );
    let sent = 0;
    let failed = 0;
    for (const delivery of due) {
      const outcome = await step.run(`deliver-${delivery.id}`, async () => {
        const result = await deliverDelivery(ctx, delivery.id);
        if (!result.ok) throw result.error;
        return result.value;
      });
      if (outcome.status === 'sent') sent += 1;
      else if (outcome.status === 'failed') failed += 1;
    }
    logger.info('deferred notifications re-evaluated', {
      outcome: `due=${String(due.length)} sent=${String(sent)} failed=${String(failed)}`,
    });
    return { due: due.length, sent, failed };
  },
);
