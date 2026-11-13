import { createServiceContext } from '@learny/services';
import { runQuizGrade } from '@learny/services';

import { defineFunction } from '../define';

// SPEC-611 ET-8, BR-QUI-04, CL-6 — durable correction of one submitted validation attempt:
// open answers by the tutor, then the score, the learning result and `quiz/graded`. Each write is
// its own idempotent step (ADR-0017); a tutor failure leaves the attempt `submitted`, notifies the
// learner, and `POST submit` relaunches this function.

export const QUIZ_GRADE_ID = 'quiz-grade';

export const quizGradeJob = defineFunction(
  {
    id: QUIZ_GRADE_ID,
    trigger: { event: 'quiz/submitted' },
    retries: 3,
    concurrency: { key: 'event.data.attemptId', limit: 1 },
    timeouts: { finish: '5m' },
  },
  async ({ event, step, ctx }) => {
    const { userId, attemptId } = event.data;
    const service = () =>
      createServiceContext({
        userId,
        requestId: ctx.requestId,
        clock: ctx.clock,
        logger: ctx.logger,
      });

    return step.run('grade-quiz', async () => {
      // The service orchestrates the four normative steps; it stays a single step so a retry never
      // observes a half-applied learning result. Every inner write is idempotent.
      const outcome = await runQuizGrade(service(), attemptId);
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    });
  },
);
