import { saveQuizAnswer } from '@learny/contracts';
import { saveDraft } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-611 ET-2 — draft of an unchecked answer (open question restored after a reload, CL-1).
export const PUT = handler(saveQuizAnswer, ({ ctx, params, body }) =>
  saveDraft(ctx, params.aid, params.pos, body),
);
