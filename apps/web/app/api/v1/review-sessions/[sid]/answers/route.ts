import { reviewAnswer } from '@learny/contracts';
import { answerReviewItem } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-701 ET-2 — one answer of the session, idempotent by clientAnswerId (CL-5).
export const POST = handler(reviewAnswer, ({ ctx, params, body }) =>
  answerReviewItem(ctx, params.sid, body),
);
