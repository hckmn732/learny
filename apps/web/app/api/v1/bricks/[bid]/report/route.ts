import { brickReport } from '@learny/contracts';
import { reportBrick } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-501 EF-3 — report an owned brick. The first report answers 201; an existing open report of
// the same learner answers 200 with the same identifier (idempotent, even without a replay key).
export const POST = handler(brickReport, async ({ ctx, params, body }) => {
  const result = await reportBrick(ctx, params.bid, body);
  if (!result.ok) return result;
  const { reportId, status, created } = result.value;
  return Response.json({ reportId, status }, { status: created ? 201 : 200 });
});
