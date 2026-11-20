import {
  getFinalReview as getFinalReviewRoute,
  setMaintenance as setMaintenanceRoute,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getFinalReview, setMaintenance } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `final-review` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const finalReviewImplementations = {
  getFinalReview: ({ ctx, params }: HandlerArgs<typeof getFinalReviewRoute>) =>
    getFinalReview(ctx, params.fid),
  setMaintenance: ({ ctx, params, body }: HandlerArgs<typeof setMaintenanceRoute>) =>
    setMaintenance(ctx, params.fid, body),
};
