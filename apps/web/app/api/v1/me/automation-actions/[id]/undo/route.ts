import { undoAutomationAction } from '@learny/automations';
import { meAutomationActionUndo } from '@learny/contracts';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-711 ET-5, BR-AUT-11 — the learner cancels one applied action; a consumed action answers
// 422 AUTOMATION_ACTION_CONSUMED and keeps its history (CL-4).
export const POST = handler(meAutomationActionUndo, ({ ctx, params }) =>
  undoAutomationAction(ctx, { actionId: params.id }),
);
