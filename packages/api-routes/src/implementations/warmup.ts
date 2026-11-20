import { warmupAnswer, warmupTodayGet } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { answerWarmup, getTodayWarmups } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `warmup` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const warmupImplementations = {
  warmupAnswer: ({ ctx, params, body }: HandlerArgs<typeof warmupAnswer>) =>
    answerWarmup(ctx, {
      activityId: params.activityId,
      position: body.position,
      knew: body.knew,
    }),
  warmupTodayGet: ({ ctx }: HandlerArgs<typeof warmupTodayGet>) => getTodayWarmups(ctx),
};
