// Hourly purge of the security tables (SPEC-208 EF-7, ADR-0258): idempotency keys older than 24 h
// and rate-limit buckets untouched for 24 h are deleted after each `cron/hourly-tick`. The tick
// instant is the idempotency key, so a replayed tick purges once.
import { purgeSecurityRows } from '@learny/db';

import { defineFunction } from '../define';

export const SECURITY_PURGE_ID = 'security-purge';

export const securityPurge = defineFunction(
  {
    id: SECURITY_PURGE_ID,
    trigger: { event: 'cron/hourly-tick' },
    idempotency: 'event.data.tickAt',
  },
  async ({ step, ctx, logger }) => {
    const removed = await step.run('purge-expired-rows', () =>
      ctx.sdb.transaction((tx) => purgeSecurityRows(tx, ctx.clock.now())),
    );
    logger.info('security purge completed', {
      outcome: `idempotency_keys=${String(removed.idempotencyKeys)} buckets=${String(removed.rateLimitBuckets)}`,
    });
    return removed;
  },
);
