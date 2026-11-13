import { getExamAttempt } from '@learny/contracts';
import { getExamAttempt as getExamAttemptService } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-614 ET-4 — read model with the server time and the real remaining time.
export const GET = handler(getExamAttempt, ({ ctx, params }) =>
  getExamAttemptService(ctx, params.aid),
);
