import { agendaReplanRoutes } from '@learny/contracts';
import { moveSlot } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-705 ET-3 — one idempotent move guarded by the version read with the alternatives.
export const POST = handler(agendaReplanRoutes.slotMove, ({ ctx, params, body }) =>
  moveSlot(ctx, params.sid, body),
);
