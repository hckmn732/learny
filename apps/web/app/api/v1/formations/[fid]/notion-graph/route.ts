import { notionGraph } from '@learny/contracts';
import { getNotionGraph } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-616 — notion graph of one formation, read under the learner's JWT. The route is a thin
// shell: RLS hides another learner's formation (404) and another member's private links or
// contributions never enter the payload (ET-3, CL-5).
export const GET = handler(notionGraph, ({ ctx, params }) =>
  getNotionGraph(ctx, { formationId: params.fid }),
);
