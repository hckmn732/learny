// Nightly purge of the offline synchronisation receipts older than 30 days (SPEC-801 ET-6,
// ADR-0200). It follows `cron/nightly`, like the outbox cleanup; the tick instant makes a replay
// purge once.
import { purgeOfflineReceipts } from '@learny/db';

import { defineFunction } from '../define';

export const OFFLINE_RECEIPTS_PURGE_ID = 'offline-receipts-purge';

export const offlineReceiptsPurge = defineFunction(
  { id: OFFLINE_RECEIPTS_PURGE_ID, trigger: { event: 'cron/nightly' } },
  async ({ step, ctx, logger }) => {
    const deleted = await step.run('purge-offline-receipts', () =>
      ctx.sdb.transaction((tx) => purgeOfflineReceipts(tx, ctx.clock.now())),
    );
    logger.info('offline receipts purge completed', { outcome: `deleted=${String(deleted)}` });
    return { deleted };
  },
);
