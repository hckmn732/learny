import { submitExamAttempt } from '@learny/contracts';
import { submitExam } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-614 EF-3, CL-3, CL-4 — one submission, immediate correction, no second result.
export const POST = handler(submitExamAttempt, ({ ctx, params }) =>
  submitExam(ctx, params.aid, { trigger: 'manual' }),
);
