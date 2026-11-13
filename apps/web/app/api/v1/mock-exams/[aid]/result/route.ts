import { getExamResult } from '@learny/contracts';
import { getExamResult as getExamResultService } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-614 EF-4 — separated scores, studied gaps, tutor plan and the filterable review.
export const GET = handler(getExamResult, ({ ctx, params }) =>
  getExamResultService(ctx, params.aid),
);
