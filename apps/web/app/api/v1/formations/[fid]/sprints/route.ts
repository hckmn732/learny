import { planSprintsBeforeMilestones } from '@learny/automations';
import { sprintPlanRoute } from '@learny/contracts';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-719 ET-1, ET-3 — plans the J-K and J-1 sprints of the upcoming validation quizzes and mock
// exams of one formation. The service runs under RLS: a foreign formation or milestone answers 404.
export const POST = handler(sprintPlanRoute, ({ ctx, params, body }) =>
  planSprintsBeforeMilestones(ctx, {
    formationId: params.fid,
    ...(body.examSlotId === undefined ? {} : { examSlotId: body.examSlotId }),
  }),
);
