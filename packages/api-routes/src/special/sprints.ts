import { planSprintsBeforeMilestones } from '@learny/automations';
import { sprintPlanRoute } from '@learny/contracts';
import { routeHandler } from '@learny/http/route-handler';
import type { HandlerArgs } from '@learny/http/route-handler';

import type { SpecialHandler } from './types';

// SPEC-1004 — `POST /formations/:fid/sprints` is a standard `handler()` route whose contract
// (`sprintPlanRoute`, SPEC-719) was never added to the `ROUTES` registry. It stays on the standard
// path here, declared as a special handler so the generated file has exactly one delegation; the
// registry gap is reported in evidence/SPEC-1004/acceptance.md and left to a later specification.
const wrapped = routeHandler(
  sprintPlanRoute,
  ({ ctx, params, body }: HandlerArgs<typeof sprintPlanRoute>) =>
    planSprintsBeforeMilestones(ctx, {
      formationId: params.fid,
      ...(body.examSlotId === undefined ? {} : { examSlotId: body.examSlotId }),
    }),
);

export const formationSprintsSpecial: SpecialHandler = {
  method: sprintPlanRoute.method,
  path: sprintPlanRoute.path,
  handle: (request, params) => wrapped(request, { params: Promise.resolve(params) }),
};
