import { warmupAnswer } from '@learny/contracts';
import { answerWarmup } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-714 ET-2 — one first-pass answer: FSRS, evening quiz and consumption in one transaction.
export const POST = handler(warmupAnswer, ({ ctx, params, body }) =>
  answerWarmup(ctx, {
    activityId: params.activityId,
    position: body.position,
    knew: body.knew,
  }),
);
