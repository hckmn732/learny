import { meWeeklyReviewGet } from '@learny/contracts';
import { getWeeklyReview } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-720 ET-1, EF-2 — the weekly review of the connected learner, read under RLS. A review of
// another learner is never returned; the card falls back to an explicit empty state.
export const GET = handler(meWeeklyReviewGet, ({ ctx, query }) => getWeeklyReview(ctx, query));
