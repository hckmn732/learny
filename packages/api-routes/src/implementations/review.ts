import { globalQuizToday, reviewAnswer, reviewComplete } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { answerReviewItem, completeReviewSession, getOrCreateTodaySession } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `review` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const reviewImplementations = {
  globalQuizToday: ({ ctx, params, query }: HandlerArgs<typeof globalQuizToday>) =>
    getOrCreateTodaySession(ctx, params.fid, query.mode),
  reviewAnswer: ({ ctx, params, body }: HandlerArgs<typeof reviewAnswer>) =>
    answerReviewItem(ctx, params.sid, body),
  reviewComplete: ({ ctx, params }: HandlerArgs<typeof reviewComplete>) =>
    completeReviewSession(ctx, params.sid),
};
