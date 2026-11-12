// Nightly account deletion (SPEC-211 EF-7, ET-4): every profile whose scheduled deletion is due is
// processed account by account, each step named `deletion:<userId>:<step>` so a replay resumes
// exactly where it stopped and a cancelled request deletes nothing.
import { sql } from 'drizzle-orm';

import { serviceDb } from '@learny/db';

import { defineFunction } from '../define';
import { runAccountDeletion } from '../personal-data/deletion';

import type { StepRunner } from './data-export';

export const ACCOUNT_DELETION_ID = 'account-deletion';
export const DELETION_BATCH = 50;

export const accountDeletion = defineFunction(
  {
    id: ACCOUNT_DELETION_ID,
    trigger: { event: 'cron/nightly' },
    idempotency: 'event.data.runDate',
  },
  async ({ step, ctx, logger }) => {
    const due = await step.run('select-due', async () => {
      const rows = await serviceDb().execute<{ id: string }>(sql`
        select id::text as id
        from public.profiles
        where deletion_scheduled_for is not null
          and deletion_scheduled_for <= ${ctx.clock.now().toISOString()}::timestamptz
        order by deletion_scheduled_for, id
        limit ${DELETION_BATCH}
      `);
      return rows.map((row) => row.id);
    });
    const results: { userId: string; deleted: boolean }[] = [];
    for (const userId of due) {
      const outcome = await runAccountDeletion({
        ctx,
        step: step as unknown as StepRunner,
        logger,
        userId,
      });
      results.push({ userId, deleted: outcome.deleted });
    }
    logger.info('nightly account deletion', {
      outcome: `due=${String(due.length)} deleted=${String(results.filter((r) => r.deleted).length)}`,
    });
    return { due: due.length, results };
  },
);
