import { programmeRoutes } from '@learny/contracts';
import { importProposal } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

export const POST = handler(programmeRoutes.programmeImport, ({ ctx, params, body }) =>
  importProposal(ctx, params.fid, body),
);
