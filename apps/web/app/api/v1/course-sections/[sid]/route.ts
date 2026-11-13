import { courseSectionEdit } from '@learny/contracts';
import { editCourseSection } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';
import { IDEMPOTENCY_KEY_HEADER } from '../../../../../lib/api/idempotency';

export const dynamic = 'force-dynamic';

// SPEC-609 EF-4 — a learner correction creates version N+1; a stale expectedVersion is a 409.
export const PATCH = handler(courseSectionEdit, ({ ctx, params, body, request }) =>
  editCourseSection(ctx, params.sid, {
    ...body,
    requestKey: request.headers.get(IDEMPOTENCY_KEY_HEADER),
  }),
);
