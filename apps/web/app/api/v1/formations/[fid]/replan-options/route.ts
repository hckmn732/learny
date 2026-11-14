import { agendaReplanRoutes } from '@learny/contracts';
import { getReplanOptions } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-705 ET-4 — the three BR-FOR-14 previews; this route never writes.
export const POST = handler(agendaReplanRoutes.formationReplanOptions, ({ ctx, params }) =>
  getReplanOptions(ctx, params.fid),
);
