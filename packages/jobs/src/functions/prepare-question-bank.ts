import {
  enqueueCourseQuestionBanks,
  processQuestionBankJobs,
  type QuestionBankContext,
} from '@learny/tutor';

import type { JobContext } from '../context';
import { defineFunction } from '../define';

// SPEC-513 EF-2, ET-2, BR-IA-13 — course generation enqueues one job per notion and format; the
// nightly cron drains the queue in a provider batch. Both handlers are idempotent: the job key is
// `(learner, notion, format, course version)` and every insert re-checks the fingerprints under a
// transaction advisory lock. No question is invented when the provider is unavailable.

function bankContext(ctx: JobContext, userId: string): QuestionBankContext {
  return {
    userId,
    requestId: ctx.requestId,
    store: { run: (fn) => ctx.sdb.transaction(fn) },
    llmDb: ctx.sdb,
    clock: ctx.clock,
    logger: ctx.logger,
  };
}

export const PREPARE_QUESTION_BANK_ID = 'prepare-question-bank';

export const prepareQuestionBankForCourse = defineFunction(
  {
    id: PREPARE_QUESTION_BANK_ID,
    trigger: { event: 'course/generated' },
    // The same course event never overlaps: the enqueue upserts the same job rows.
    concurrency: { key: 'event.data.courseId', limit: 1 },
    timeouts: { finish: '10m' },
  },
  async ({ event, ctx }) => {
    const result = await enqueueCourseQuestionBanks(bankContext(ctx, event.data.userId), {
      courseId: event.data.courseId,
      moduleId: event.data.moduleId,
      reason: 'course_generated',
    });
    return { requestId: result.requestId, jobs: result.jobs.length };
  },
);

export const QUESTION_BANK_NIGHTLY_ID = 'question-bank-nightly';

export const questionBankNightly = defineFunction(
  {
    id: QUESTION_BANK_NIGHTLY_ID,
    trigger: { event: 'cron/nightly' },
    concurrency: { key: 'event.data.runDate', limit: 1 },
    timeouts: { finish: '15m' },
  },
  async ({ ctx }) => {
    // The run context has no learner; `processQuestionBankJobs` reads the owner of each row.
    const result = await processQuestionBankJobs(bankContext(ctx, ''), { limit: 50 });
    return result;
  },
);
