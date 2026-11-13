import type { Clock, LearnyLogger } from '@learny/core';

import { defineFunction } from '../define';

// SPEC-611 ET-8, BR-QUI-04, CL-6 — durable correction of one submitted validation attempt.
// The handler is injected by the host (apps/web, apps/worker): `packages/jobs` cannot import
// `packages/services` because services already imports the transaction/outbox helpers of jobs.
// The function stays a thin, idempotent step; every business write is performed by the service.

export const QUIZ_GRADE_ID = 'quiz-grade';

export interface QuizGradeRunArgs {
  userId: string;
  attemptId: string;
  requestId: string;
  clock: Clock;
  logger: LearnyLogger;
}

export interface QuizGradeDeps {
  run: (args: QuizGradeRunArgs) => Promise<unknown>;
}

export function createQuizGradeJob(deps: QuizGradeDeps) {
  return defineFunction(
    {
      id: QUIZ_GRADE_ID,
      trigger: { event: 'quiz/submitted' },
      retries: 3,
      concurrency: { key: 'event.data.attemptId', limit: 1 },
      timeouts: { finish: '5m' },
    },
    async ({ event, step, ctx }) => {
      const { userId, attemptId } = event.data;
      return step.run('grade-quiz', () =>
        deps.run({
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
