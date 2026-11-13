import { saveExamAnswer } from '@learny/contracts';
import { saveExamAnswer as saveExamAnswerService } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-614 EF-2, ET-4 — free navigation and drafts; a response after the deadline is refused.
export const PUT = handler(saveExamAnswer, ({ ctx, params, body }) =>
  saveExamAnswerService(ctx, params.aid, params.pos, body),
);
