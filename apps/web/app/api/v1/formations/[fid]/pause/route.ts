import { formationManagementRoutes } from '@learny/contracts';
import { pauseFormation } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-618 — pauses one formation and freezes its future slots (BR-FOR-15).
export const POST = handler(formationManagementRoutes.formationPause, ({ ctx, params, body }) =>
  pauseFormation(ctx, params.fid, body),
);
