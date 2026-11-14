import { globalQuizToday } from '@learny/contracts';
import { getOrCreateTodaySession } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-701 ET-2 — the session of the day, created on the first load of the local day (EF-2).
export const GET = handler(globalQuizToday, ({ ctx, params, query }) =>
  getOrCreateTodaySession(ctx, params.fid, query.mode),
);
