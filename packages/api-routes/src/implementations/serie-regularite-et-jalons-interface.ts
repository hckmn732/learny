import { milestonesList, streakGet } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getMilestones, getStreak } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `serie-regularite-et-jalons-interface` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const serieRegulariteEtJalonsInterfaceImplementations = {
  milestonesList: ({ ctx, query }: HandlerArgs<typeof milestonesList>) => getMilestones(ctx, query),
  streakGet: ({ ctx }: HandlerArgs<typeof streakGet>) => getStreak(ctx),
};
