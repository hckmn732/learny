import { agendaGet } from '@learny/contracts';
import { getAgenda } from '@learny/services';

import { handler } from '../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-704 — one authenticated read of the agenda (ET-1). RLS keeps the slots of another learner
// out of the DTO; the route never calls an AI provider and the window is bounded to 42 days.
export const GET = handler(agendaGet, ({ ctx, query }) => getAgenda(ctx, query));
