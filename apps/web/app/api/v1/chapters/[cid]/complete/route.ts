import { chapterComplete } from '@learny/contracts';
import { completeChapter } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-607 EF-4 — one chapter transition; the single generation event follows the all-done state.
export const POST = handler(chapterComplete, ({ ctx, params, body }) =>
  completeChapter(ctx, params.cid, body),
);
