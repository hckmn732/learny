import { gapsList } from '@learny/contracts';
import { listGaps } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-615 — open gaps of one formation, read under the learner's JWT. The route is a thin shell:
// the filter, the independent counters, the remediation links and the next review are resolved by
// the service; another learner's formation is a 404 through RLS.
export const GET = handler(gapsList, ({ ctx, params, query }) =>
  listGaps(ctx, { formationId: params.fid, nature: query.nature ?? null }),
);
