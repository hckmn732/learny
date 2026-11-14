import { milestonesList } from '@learny/contracts';
import { getMilestones } from '@learny/services';

import { handler } from '../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-723 ET-3 — achieved milestones of the caller, newest first. A foreign `formationId` is a
// 404 under RLS; the optional query never widens the scope of the read.
export const GET = handler(milestonesList, ({ ctx, query }) => getMilestones(ctx, query));
