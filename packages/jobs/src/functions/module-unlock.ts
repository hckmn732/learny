import type { Clock, LearnyLogger } from '@learny/core';

import { defineFunction } from '../define';

// SPEC-612 ET-3, BR-QUI-05, BR-FOR-07 — durable unlock of the module after a passed validation
// quiz. The handler is injected by the host for the same reason as quiz-grade: jobs cannot import
// services (services already imports the transaction/outbox helpers). The service is idempotent.

export const MODULE_UNLOCK_ID = 'module-unlock';

export interface ModuleUnlockRunArgs {
  userId: string;
  formationId: string;
  moduleId: string;
  attemptId: string;
  score: number;
  passed: boolean;
  requestId: string;
  clock: Clock;
  logger: LearnyLogger;
}

export interface ModuleUnlockDeps {
  run: (args: ModuleUnlockRunArgs) => Promise<unknown>;
}

export function createModuleUnlockJob(deps: ModuleUnlockDeps) {
  return defineFunction(
    {
      id: MODULE_UNLOCK_ID,
      trigger: { event: 'quiz/graded' },
      retries: 3,
      concurrency: { key: 'event.data.moduleId', limit: 1 },
      timeouts: { finish: '5m' },
    },
    async ({ event, step, ctx }) => {
      const { userId, formationId, moduleId, attemptId, score, passed } = event.data;
      return step.run('unlock-module', () =>
        deps.run({
          userId,
          formationId,
          moduleId,
          attemptId,
          score,
          passed,
          requestId: ctx.requestId,
          clock: ctx.clock,
          logger: ctx.logger,
        }),
      );
    },
  );
}
