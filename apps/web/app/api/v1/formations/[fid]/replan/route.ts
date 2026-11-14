import { agendaReplanRoutes } from '@learny/contracts';
import { applyReplan } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-705 ET-4 — the explicit choice replans future slots; « alléger » waits for consent.
export const POST = handler(agendaReplanRoutes.formationReplan, ({ ctx, params, body }) =>
  applyReplan(ctx, params.fid, body),
);
