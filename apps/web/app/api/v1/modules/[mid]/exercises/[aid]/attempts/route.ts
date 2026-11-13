import { exerciseStart } from '@learny/contracts';
import { startExerciseAttempt } from '@learny/services';

import { handler } from '../../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-613 — starts or resumes the single in-progress attempt; the idempotency key makes a double
// click a replay of the first answer (ET-2, ET-5).
export const POST = handler(exerciseStart, ({ ctx, params }) =>
  startExerciseAttempt(ctx, { exerciseId: params.aid, moduleId: params.mid }),
);
