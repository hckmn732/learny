// Generation of the validation quiz reminders (SPEC-706 EF-2, ET-6, BR-NOT-07).
//
// After every hourly tick, the planned validation quizzes whose 40-minute instant falls in the next
// hour receive their reminder with `eligibleAt` set to that exact instant. The job is idempotent on
// the tick and on the dedupe key `validation_soon:<slotId>:<startsAt>`: a replay creates nothing;
// a move cancels the previous unsent reminder (CA-2).
import { syncValidationQuizReminders } from '@learny/notifications/producers/reminders';

import { defineFunction } from '../define';

export const NOTIFICATIONS_REMINDERS_ID = 'notifications-reminders';
export const REMINDER_JOB_BATCH = 200;

export const notificationsReminders = defineFunction(
  {
    id: NOTIFICATIONS_REMINDERS_ID,
    trigger: { event: 'cron/hourly-tick' },
    idempotency: 'event.data.tickAt',
    retries: 1,
  },
  async ({ step, ctx, logger }) => {
    const summary = await step.run('sync-validation-reminders', () =>
      syncValidationQuizReminders(ctx, { batchSize: REMINDER_JOB_BATCH }),
    );
    logger.info('validation quiz reminders generated', {
      outcome: `produced=${String(summary.produced)} created=${String(summary.created)} cancelled=${String(summary.cancelled)} expired=${String(summary.expired)}`,
    });
    return summary;
  },
);
