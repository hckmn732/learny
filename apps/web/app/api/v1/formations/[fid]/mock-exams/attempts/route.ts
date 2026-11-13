import { startExamAttempt } from '@learny/contracts';
import { startExamAttempt as startExamAttemptService } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-614 EF-1, EF-2 — 201 created, 200 resumed with the real remaining time (ADR-0172).
export const POST = handler(startExamAttempt, async ({ ctx, params }) => {
  const result = await startExamAttemptService(ctx, params.fid);
  if (!result.ok) return result;
  if (result.value.resumed === true) {
    return Response.json(result.value, { status: 200 });
  }
  return result;
});
