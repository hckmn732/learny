import { exerciseDetail } from '@learny/contracts';
import { getPracticeExercise } from '@learny/services';

import { handler } from '../../../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-613 — exercise read model of SCR-08 under the learner's JWT. The service verifies the
// formation, the module and the ownership; another learner's activity is a 404 through RLS.
export const GET = handler(exerciseDetail, ({ ctx, params }) =>
  getPracticeExercise(ctx, {
    formationId: params.fid,
    moduleId: params.mid,
    exerciseId: params.aid,
  }),
);
