import type { Clock, LearnyLogger } from '@learny/core';

import { defineFunction } from '../define';

// SPEC-614 EF-2, ET-4, ADR-0172 §3(b) — durable automatic submission of a mock exam at its
// server deadline plus the five-second network tolerance. The handler is injected by the host:
// `packages/jobs` cannot import `packages/services`. The service checks the deadline again, so an
// early execution (inline dispatcher, replayed step) never ends the exam before its time.

export const EXAM_DEADLINE_ID = 'exam-deadline';
export const EXAM_DEADLINE_GRACE_MS = 5_000;

export interface ExamDeadlineRunArgs {
  userId: string;
  attemptId: string;
  requestId: string;
  clock: Clock;
  logger: LearnyLogger;
}

export interface ExamDeadlineDeps {
  submit: (args: ExamDeadlineRunArgs) => Promise<unknown>;
}

export function createExamDeadlineJob(deps: ExamDeadlineDeps) {
  return defineFunction(
    {
      id: EXAM_DEADLINE_ID,
      trigger: { event: 'exam/started' },
      retries: 3,
      concurrency: { key: 'event.data.attemptId', limit: 1 },
      idempotency: 'event.data.attemptId',
      timeouts: { finish: '1h' },
    },
    async ({ event, step, ctx }) => {
      const { userId, attemptId, deadlineAt } = event.data;
      await step.sleepUntil(
        'wait-deadline',
        new Date(new Date(deadlineAt).getTime() + EXAM_DEADLINE_GRACE_MS),
      );
      return step.run('submit-exam', () =>
        deps.submit({
          userId,
          attemptId,
          requestId: ctx.requestId,
          clock: ctx.clock,
          logger: ctx.logger,
        }),
      );
    },
  );
}
