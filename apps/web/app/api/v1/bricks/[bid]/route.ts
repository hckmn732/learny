import { brickCorrect } from '@learny/contracts';
import { correctBrick } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-501 EF-4 — learner correction of an owned brick; creates version N+1 under RLS.
export const PATCH = handler(brickCorrect, async ({ ctx, params, body }) => {
  const result = await correctBrick(ctx, params.bid, body);
  if (!result.ok) return result;
  const { brickId, version, versionId } = result.value;
  return { brickId, version, versionId };
});
