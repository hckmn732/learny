import type { Clock, LearnyLogger } from '@learny/core';

import { defineFunction } from '../define';

// SPEC-612 ET-4, ADR-0173 — preparation of the targeted remediation after a failed validation
// quiz, and on demand (`remediation/requested`). Both functions delegate to the same idempotent
// service; the handler is injected by the host because jobs cannot import services.

export const REMEDIATION_PREPARE_ID = 'remediation-prepare';
export const REMEDIATION_PREPARE_REQUESTED_ID = 'remediation-prepare-requested';

export interface RemediationPrepareRunArgs {
  userId: string;
  formationId: string;
  moduleId: string;
  attemptId: string | null;
  requestId: string;
  clock: Clock;
  logger: LearnyLogger;
}

export interface RemediationPrepareDeps {
  run: (args: RemediationPrepareRunArgs) => Promise<unknown>;
}

export function createRemediationPrepareJob(deps: RemediationPrepareDeps) {
  return defineFunction(
    {
      id: REMEDIATION_PREPARE_ID,
      trigger: { event: 'quiz/graded' },
      retries: 3,
      concurrency: { key: 'event.data.moduleId', limit: 1 },
      timeouts: { finish: '5m' },
    },
    async ({ event, step, ctx }) => {
      const { userId, formationId, moduleId, attemptId, passed } = event.data;
      if (passed) return { skipped: true as const };
      return step.run('prepare-remediation', () =>
        deps.run({
          userId,
          formationId,
          moduleId,
          attemptId,
          requestId: ctx.requestId,
          clock: ctx.clock,
          logger: ctx.logger,
        }),
      );
    },
  );
}

export function createRemediationPrepareRequestedJob(deps: RemediationPrepareDeps) {
  return defineFunction(
    {
      id: REMEDIATION_PREPARE_REQUESTED_ID,
      trigger: { event: 'remediation/requested' },
      retries: 3,
      concurrency: { key: 'event.data.moduleId', limit: 1 },
      timeouts: { finish: '5m' },
    },
    async ({ event, step, ctx }) => {
      const { userId, formationId, moduleId, attemptId } = event.data;
      return step.run('prepare-remediation-requested', () =>
        deps.run({
          userId,
          formationId,
          moduleId,
          attemptId,
          requestId: ctx.requestId,
          clock: ctx.clock,
          logger: ctx.logger,
        }),
      );
    },
  );
}
