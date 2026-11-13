import { programmeRoutes } from '@learny/contracts';
import { generateProposal } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

export const POST = handler(programmeRoutes.programmeGenerate, ({ ctx, params, body }) =>
  generateProposal(ctx, params.fid, body),
);
