import {
  completeRemediation as completeRemediationRoute,
  getQuizResult as getQuizResultRoute,
  getRemediation,
  prepareRemediation,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  completeRemediation,
  getQuizResult,
  getRemediation as getRemediationService,
  requestRemediationPreparation,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `quiz-result` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const quizResultImplementations = {
  getQuizResult: ({ ctx, params }: HandlerArgs<typeof getQuizResultRoute>) =>
    getQuizResult(ctx, params.aid),
  completeRemediation: ({ ctx, params }: HandlerArgs<typeof completeRemediationRoute>) =>
    completeRemediation(ctx, params.mid),
  getRemediation: ({ ctx, params }: HandlerArgs<typeof getRemediation>) =>
    getRemediationService(ctx, params.mid),
  prepareRemediation: async ({ ctx, params }: HandlerArgs<typeof prepareRemediation>) => {
    const result = await requestRemediationPreparation(ctx, params.mid);
    if (!result.ok) return result;
    return Response.json(result.value, { status: 202 });
  },
};
