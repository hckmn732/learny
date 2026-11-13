import { getQuizResult as getQuizResultRoute } from '@learny/contracts';
import { getQuizResult } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-612 ET-2 — complete result of a corrected attempt (score, gaps, history, retry, remediation).
export const GET = handler(getQuizResultRoute, ({ ctx, params }) =>
  getQuizResult(ctx, params.aid),
);
