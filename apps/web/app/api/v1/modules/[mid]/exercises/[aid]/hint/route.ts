import { exerciseHint } from '@learny/contracts';
import { requestExerciseHint } from '@learny/services';

import { handler } from '../../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-613 — reveals the next hint of an owned exercise. A third request is a 422 and leaves the
// maximum score unchanged (CL-3); another learner's activity is a 404.
export const POST = handler(exerciseHint, ({ ctx, params }) =>
  requestExerciseHint(ctx, { exerciseId: params.aid, moduleId: params.mid }),
);
