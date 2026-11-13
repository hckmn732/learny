import { createQuizGradeJob, functions, setInlineRegistry } from '@learny/jobs';
import { createServiceContext, runQuizGrade } from '@learny/services';

// SPEC-611 ET-8 — the quiz-grade job needs the services package; `@learny/jobs` cannot depend on
// it (services already imports the transaction/outbox helpers of jobs). The host therefore injects
// the handler. The inline dispatcher (JOBS_MODE=inline, tests) must know the function at boot, not
// only when the Inngest route is first loaded, hence the explicit registration below.

export const quizGradeJob = createQuizGradeJob({
  run: async ({ userId, attemptId, requestId, clock, logger }) => {
    const outcome = await runQuizGrade(
      createServiceContext({ userId, requestId, clock, logger }),
      attemptId,
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  },
});

export const jobRegistry = [...functions, quizGradeJob];

export function registerInlineJobs(): void {
  setInlineRegistry(jobRegistry);
}
