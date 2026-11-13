import { courseProgress } from '@learny/contracts';
import { recordCourseProgress } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-609 ET-4 — monotone reading progress of one chapter, derived from visible sections.
export const PUT = handler(courseProgress, ({ ctx, params, body }) =>
  recordCourseProgress(ctx, params.cid, body),
);
