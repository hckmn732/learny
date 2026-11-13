import { checkQuizAnswer } from '@learny/contracts';
import { checkAnswer } from '@learny/services';

import { handler } from '../../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-611 ET-2, BR-QUI-04 — immediate correction, idempotent on a second call.
export const POST = handler(checkQuizAnswer, ({ ctx, params, body }) =>
  checkAnswer(ctx, params.aid, params.pos, body),
);
