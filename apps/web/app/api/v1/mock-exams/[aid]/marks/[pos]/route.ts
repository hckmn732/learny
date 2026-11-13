import { markExamQuestion } from '@learny/contracts';
import { markExamQuestion as markExamQuestionService } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-614 BR-PRA-03 — the « à revoir » marker survives a reload.
export const PUT = handler(markExamQuestion, ({ ctx, params, body }) =>
  markExamQuestionService(ctx, params.aid, params.pos, body.marked),
);
