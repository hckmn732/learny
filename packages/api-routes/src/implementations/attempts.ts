import {
  checkQuizAnswer,
  getQuizAttempt,
  saveQuizAnswer,
  startQuizAttempt,
  submitQuizAttempt,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  checkAnswer,
  getAttempt,
  saveDraft,
  startValidationAttempt,
  submitAttempt,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `attempts` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const attemptsImplementations = {
  checkQuizAnswer: ({ ctx, params, body }: HandlerArgs<typeof checkQuizAnswer>) =>
    checkAnswer(ctx, params.aid, params.pos, body),
  saveQuizAnswer: ({ ctx, params, body }: HandlerArgs<typeof saveQuizAnswer>) =>
    saveDraft(ctx, params.aid, params.pos, body),
  getQuizAttempt: ({ ctx, params }: HandlerArgs<typeof getQuizAttempt>) =>
    getAttempt(ctx, params.aid),
  submitQuizAttempt: ({ ctx, params }: HandlerArgs<typeof submitQuizAttempt>) =>
    submitAttempt(ctx, params.aid),
  startQuizAttempt: async ({ ctx, params }: HandlerArgs<typeof startQuizAttempt>) => {
    const result = await startValidationAttempt(ctx, params.mid);
    if (!result.ok) return result;
    if ('preparing' in result.value) {
      return Response.json(result.value, { status: 202 });
    }
    if ('resumed' in result.value) {
      return Response.json(result.value, { status: 200 });
    }
    return result;
  },
};
