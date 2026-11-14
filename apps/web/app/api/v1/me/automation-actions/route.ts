import { listMyAutomationActions } from '@learny/automations';
import { meAutomationActionsList } from '@learny/contracts';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-711 ET-5, BR-AUT-12 — the journal of the connected learner, newest first, with the weekly
// counter. RLS keeps another learner's actions out of the page and out of the counter.
export const GET = handler(meAutomationActionsList, ({ ctx, query }) =>
  listMyAutomationActions(ctx, query),
);
