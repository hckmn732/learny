import { getFinalReview as getFinalReviewRoute } from '@learny/contracts';
import { getFinalReview } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-617 ET-3 — final review of a completed formation (acquis, gaps, map, hours, retention).
export const GET = handler(getFinalReviewRoute, ({ ctx, params }) =>
  getFinalReview(ctx, params.fid),
);
