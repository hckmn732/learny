import { acceptAutomationAction } from '@learny/automations';
import { meAutomationActionAccept } from '@learny/contracts';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-711 ET-5 — the learner consents to one pending action; `choice` is transmitted to the
// effect (`payload.choice`). A concurrent acceptance applies the effect once (CA-2) and an
// expired action answers 409 (CL-3).
export const POST = handler(meAutomationActionAccept, ({ ctx, params, body }) =>
  acceptAutomationAction(ctx, { actionId: params.id, choice: body.choice }),
);
