import { exerciseSaveDraft } from '@learny/contracts';
import { saveExerciseDraft } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-613 — stores the production before submission. No tutor call, no correction: the draft is
// restored by the page after a reload (CA-3).
export const PUT = handler(exerciseSaveDraft, ({ ctx, params, body }) =>
  saveExerciseDraft(ctx, params.aid, body.submission),
);
