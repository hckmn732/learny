import { declineAutomationAction } from '@learny/automations';
import { meAutomationActionDecline } from '@learny/contracts';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-711 ET-5 — the learner declines one pending action; the journal keeps the refused row
// (BR-AUT-12). Repeating the same refusal changes nothing.
export const POST = handler(meAutomationActionDecline, ({ ctx, params }) =>
  declineAutomationAction(ctx, { actionId: params.id }),
);
