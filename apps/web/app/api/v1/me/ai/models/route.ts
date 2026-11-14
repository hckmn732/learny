import { meAiModelsGet, meAiModelsUpdate } from '@learny/contracts';
import { getAiModelsState, updateAiModels } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-709 EF-1, EF-2 — the « Modèles d'IA » tab reads its state with the learner's RLS client;
// credentials stay owned by SPEC-505/506 and never expose a key.
export const GET = handler(meAiModelsGet, ({ ctx }) => getAiModelsState(ctx));

// SPEC-709 EF-2, ET-3 — one task choice or the whole reset, replayed idempotently; the server
// re-checks the qualification instead of trusting the selector.
export const PATCH = handler(meAiModelsUpdate, ({ ctx, body }) => updateAiModels(ctx, body));
