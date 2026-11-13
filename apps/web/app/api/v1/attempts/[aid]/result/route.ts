import { getQuizResult } from '@learny/contracts';
import { getAttemptResult } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-611 ET-2 — provisional result until the tutor has corrected the open answers (SPEC-612).
export const GET = handler(getQuizResult, ({ ctx, params }) =>
  getAttemptResult(ctx, params.aid),
);
