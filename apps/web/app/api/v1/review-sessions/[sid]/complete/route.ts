import { reviewComplete } from '@learny/contracts';
import { completeReviewSession } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-701 ET-2 — closes the session and returns its summary, idempotent (EF-11).
export const POST = handler(reviewComplete, ({ ctx, params }) =>
  completeReviewSession(ctx, params.sid),
);
