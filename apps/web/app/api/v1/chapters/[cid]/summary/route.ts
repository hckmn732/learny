import { chapterSummary } from '@learny/contracts';
import { submitChapterSummary } from '@learny/services';

import { IDEMPOTENCY_KEY_HEADER } from '../../../../../../lib/api/idempotency';
import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-609 EF-3 — the learner's summary is stored first, then corrected by the tutor. The route
// idempotency key makes a replay return the first summary without a second event.
export const POST = handler(chapterSummary, ({ ctx, params, body, request }) =>
  submitChapterSummary(ctx, params.cid, {
    ...body,
    requestKey: request.headers.get(IDEMPOTENCY_KEY_HEADER),
  }),
);
