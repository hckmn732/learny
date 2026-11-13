import {
  createModuleUnlockJob,
  createQuizGradeJob,
  createRemediationPrepareJob,
  createRemediationPrepareRequestedJob,
  functions,
  setInlineRegistry,
} from '@learny/jobs';
import {
  createServiceContext,
  prepareRemediation,
  runQuizGrade,
  unlockModule,
} from '@learny/services';
import type { Clock, LearnyLogger } from '@learny/core';

// SPEC-611/612 — the jobs that need services are injected by the host; `@learny/jobs` cannot
// depend on `@learny/services` (services already imports the transaction/outbox helpers of jobs).
// The inline dispatcher (JOBS_MODE=inline, tests) must know them at boot.

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

export const moduleUnlockJob = createModuleUnlockJob({
  run: async ({ userId, formationId, moduleId, attemptId, score, passed, requestId, clock, logger }) => {
    const outcome = await unlockModule(createServiceContext({ userId, requestId, clock, logger }), {
      userId,
      formationId,
      moduleId,
      attemptId,
      score,
      passed,
    });
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  },
});

async function prepare(args: {
  userId: string;
  moduleId: string;
  requestId: string;
  clock: Clock;
  logger: LearnyLogger;
}): Promise<unknown> {
  const outcome = await prepareRemediation(
    createServiceContext({
      userId: args.userId,
      requestId: args.requestId,
      clock: args.clock,
      logger: args.logger,
    }),
    args.moduleId,
    { trigger: 'auto' },
  );
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

export const remediationPrepareJob = createRemediationPrepareJob({
  run: (args) => prepare(args),
});

export const remediationPrepareRequestedJob = createRemediationPrepareRequestedJob({
  run: (args) => prepare(args),
});

export const jobRegistry = [
  ...functions,
  quizGradeJob,
  moduleUnlockJob,
  remediationPrepareJob,
  remediationPrepareRequestedJob,
];

export function registerInlineJobs(): void {
  setInlineRegistry(jobRegistry);
}
