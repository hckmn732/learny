import { agendaReplanRoutes } from '@learny/contracts';
import { getSlotAlternatives } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-705 ET-3 — three compatible windows for one future slot, computed by SPEC-407 behind RLS.
export const GET = handler(agendaReplanRoutes.slotAlternativesGet, ({ ctx, params }) =>
  getSlotAlternatives(ctx, params.sid),
);
