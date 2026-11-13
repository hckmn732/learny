import { startQuizAttempt } from '@learny/contracts';
import { startValidationAttempt } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-611 ET-2, EF-1, EF-8 — 201 created, 200 resumed, 202 preparing when a bank is exhausted.
export const POST = handler(startQuizAttempt, async ({ ctx, params }) => {
  const result = await startValidationAttempt(ctx, params.mid);
  if (!result.ok) return result;
  if ('preparing' in result.value) {
    return Response.json(result.value, { status: 202 });
  }
  if ('resumed' in result.value) {
    return Response.json(result.value, { status: 200 });
  }
  return result;
});
