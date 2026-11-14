import { listMyAutomations, updateMyAutomationSetting } from '@learny/automations';
import { meAutomationsList, meAutomationsUpdate } from '@learny/contracts';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-711 ET-5 — the ten automation settings of the connected learner. The service runs under
// RLS: the list carries the defaults of the registry, the update validates the parameters with
// the schema of the automation before any write.
export const GET = handler(meAutomationsList, ({ ctx }) => listMyAutomations(ctx));

export const PATCH = handler(meAutomationsUpdate, ({ ctx, body }) =>
  updateMyAutomationSetting(ctx, body),
);
