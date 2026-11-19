import { meWeeklyReviewGet } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getWeeklyReview } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `automatisme-9-bilan-de-la-semaine` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const automatisme9BilanDeLaSemaineImplementations = {
  meWeeklyReviewGet: ({ ctx, query }: HandlerArgs<typeof meWeeklyReviewGet>) =>
    getWeeklyReview(ctx, query),
};
