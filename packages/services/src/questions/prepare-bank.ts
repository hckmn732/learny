import { serviceDb } from '@learny/db';
import {
  processQuestionBankJobs,
  prepareQuestionBank as prepareBank,
  requestQuestionBank as requestBanks,
  type QuestionBankContext,
} from '@learny/tutor';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

// Application service of the personal question banks (SPEC-513 ET-1, ET-4). Reads and writes run
// on the caller's RLS transaction; model resolution and the `ai_calls` journal use the explicitly
// authorized service client, exactly like the tutor loop (SPEC-508).

function contextOf(
  ctx: ServiceContext,
  userId: string,
  store: QuestionBankContext['store'],
): QuestionBankContext {
  return {
    userId,
    requestId: ctx.requestId,
    store,
    llmDb: serviceDb(),
    clock: ctx.clock,
    logger: ctx.logger,
  };
}

export function prepareQuestionBank(ctx: ServiceContext, input: unknown) {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return prepareBank(contextOf(ctx, userId, db), input);
  });
}

export function requestQuestionBank(ctx: ServiceContext, input: unknown) {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return requestBanks(contextOf(ctx, userId, db), input);
  });
}

export function processQuestionBanks(ctx: ServiceContext, input: { limit?: number } = {}) {
  return toResult(async () => {
    const { db } = requireUser(ctx);
    // The job runner is an explicitly authorized system operation; only its counters are returned.
    return processQuestionBankJobs(contextOf(ctx, ctx.userId ?? '', db), input);
  });
}
