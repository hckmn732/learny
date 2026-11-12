// Nightly cleanup of the outbox (SPEC-203 ET-6, ADR-0122): the rows sent more than 7 days ago are
// deleted. The other nightly treatments are delivered by their own specifications.
import { defineFunction } from '../define';
import { purgeSentEvents } from '../emit';

export const NIGHTLY_OUTBOX_CLEANUP_ID = 'nightly-outbox-cleanup';
export const OUTBOX_RETENTION_DAYS = 7;

export const nightlyOutboxCleanup = defineFunction(
  { id: NIGHTLY_OUTBOX_CLEANUP_ID, trigger: { event: 'cron/nightly' } },
  async ({ step }) => {
    const deleted = await step.run('purge-sent-events', () =>
      purgeSentEvents(OUTBOX_RETENTION_DAYS),
    );
    return { deleted };
  },
);
