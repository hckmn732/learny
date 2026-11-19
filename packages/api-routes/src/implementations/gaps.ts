import { gapsList } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { listGaps } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `gaps` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const gapsImplementations = {
  gapsList: ({ ctx, params, query }: HandlerArgs<typeof gapsList>) =>
    listGaps(ctx, { formationId: params.fid, nature: query.nature ?? null }),
};
