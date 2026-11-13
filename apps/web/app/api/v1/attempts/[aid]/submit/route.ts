import { submitQuizAttempt } from '@learny/contracts';
import { submitAttempt } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-611 ET-2, ET-7 — 202 submitted; a second call relaunches the pending correction (CL-6).
export const POST = handler(submitQuizAttempt, ({ ctx, params }) =>
  submitAttempt(ctx, params.aid),
);
