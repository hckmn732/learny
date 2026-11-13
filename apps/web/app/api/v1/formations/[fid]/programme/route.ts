import { programmeRoutes } from '@learny/contracts';
import { getProgrammeScreenState } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-605, SPEC-606 — GET /formations/:fid/programme answers the proposal state while the
// programme is being prepared, then the active programme read model once it is validated.
export const GET = handler(programmeRoutes.programmeGet, ({ ctx, params }) =>
  getProgrammeScreenState(ctx, params.fid),
);
