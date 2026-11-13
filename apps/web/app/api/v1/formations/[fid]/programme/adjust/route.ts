import { programmeRoutes } from '@learny/contracts';
import { adjustProposal } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

export const POST = handler(programmeRoutes.programmeAdjust, ({ ctx, params, body }) =>
  adjustProposal(ctx, params.fid, body),
);
