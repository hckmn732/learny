import { streakGet } from '@learny/contracts';
import { getStreak } from '@learny/services';

import { handler } from '../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-723 ET-3 — streak, 14 regularity boxes, time zone and next milestone of the caller.
// The service reads the learner's own persisted activity under RLS; nothing crosses learners.
export const GET = handler(streakGet, ({ ctx }) => getStreak(ctx));
