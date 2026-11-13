import { programmeRoutes } from '@learny/contracts';
import { getProgrammeState } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

export const GET = handler(programmeRoutes.programmeGet, ({ ctx, params, query }) =>
  getProgrammeState(ctx, params.fid, query),
);
