import {
  createExamDeadlineJob,
  createQuizGradeJob,
  functions,
  setInlineRegistry,
} from '@learny/jobs';
import { createServiceContext, runQuizGrade, submitExam } from '@learny/services';

// SPEC-611 ET-8, SPEC-614 ET-4 — the durable jobs need the services package; `@learny/jobs`
// cannot depend on it (services already imports the transaction/outbox helpers of jobs). The host
// therefore injects the handlers. The inline dispatcher (JOBS_MODE=inline, tests) must know the
// functions at boot, not only when the Inngest route is first loaded, hence the registration.

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

export const examDeadlineJob = createExamDeadlineJob({
  submit: async ({ userId, attemptId, requestId, clock, logger }) => {
    const outcome = await submitExam(
      createServiceContext({ userId, requestId, clock, logger }),
      attemptId,
      { trigger: 'deadline' },
    );
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  },
});

export const jobRegistry = [...functions, quizGradeJob, examDeadlineJob];

export function registerInlineJobs(): void {
  setInlineRegistry(jobRegistry);
}
