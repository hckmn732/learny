import { programmeRoutes } from '@learny/contracts';
import { validateProposal } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

export const POST = handler(programmeRoutes.programmeValidate, ({ ctx, params, body }) =>
  validateProposal(ctx, params.fid, body),
);
