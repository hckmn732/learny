// Nightly purge of expired exports (SPEC-211 EF-8), its own function so that a failed account
// deletion never blocks the purge of the archives.
import { defineFunction } from '../define';
import { runExportsPurge } from '../personal-data/purge';

import type { StepRunner } from './data-export';

export const EXPORTS_PURGE_ID = 'exports-purge';

export const exportsPurge = defineFunction(
  {
    id: EXPORTS_PURGE_ID,
    trigger: { event: 'cron/nightly' },
    idempotency: 'event.data.runDate',
  },
  async ({ step, ctx, logger }) => {
    const outcome = await runExportsPurge({ ctx, step: step as unknown as StepRunner });
    logger.info('exports purge completed', {
      outcome: `rows=${String(outcome.rows)} objects=${String(outcome.objects)}`,
    });
    return outcome;
  },
);
