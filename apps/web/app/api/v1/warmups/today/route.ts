import { warmupTodayGet } from '@learny/contracts';
import { getTodayWarmups } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-714 ET-2 — the warm-ups of the day of the connected learner, read under RLS.
export const GET = handler(warmupTodayGet, ({ ctx }) => getTodayWarmups(ctx));
