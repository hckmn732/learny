import { meAiTaskModelsUpdate } from '@learny/contracts';
import { assignTaskModel } from '@learny/services/ai/qualify';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-506/602 — affects a qualified personal model to one task. The service refuses a report that
// failed or lacks a capability required by the task, so onboarding cannot bypass the battery.
export const PUT = handler(meAiTaskModelsUpdate, ({ ctx, body }) => assignTaskModel(ctx, body));
