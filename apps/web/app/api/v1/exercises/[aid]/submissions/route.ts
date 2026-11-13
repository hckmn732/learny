import { exerciseSubmit } from '@learny/contracts';
import { submitExercise } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-613 — validates the production, then grades it by criterion. The idempotency key and the
// graded attempt make two identical requests a single write and a single event (CL-2, CA-4).
export const POST = handler(exerciseSubmit, ({ ctx, params, body }) =>
  submitExercise(ctx, params.aid, body.submission),
);
