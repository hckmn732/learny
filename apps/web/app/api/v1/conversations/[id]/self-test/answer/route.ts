import { conversationSelfTestAnswer } from '@learny/contracts';
import { answerSelfTest } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-610 ET-7, ADR-0174 — grade the pending Teste-moi answer and apply the mastery.
export const POST = handler(conversationSelfTestAnswer, ({ ctx, params, body }) =>
  answerSelfTest(ctx, params.id, body.text),
);
