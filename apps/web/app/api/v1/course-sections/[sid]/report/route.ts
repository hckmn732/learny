import { courseSectionReport } from '@learny/contracts';
import { reportCourseSection } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';
import { IDEMPOTENCY_KEY_HEADER } from '../../../../../../lib/api/idempotency';

export const dynamic = 'force-dynamic';

// SPEC-609 EF-4 — report a section: it leaves the new quiz draws until its correction.
export const POST = handler(courseSectionReport, ({ ctx, params, body, request }) =>
  reportCourseSection(ctx, params.sid, {
    ...body,
    requestKey: request.headers.get(IDEMPOTENCY_KEY_HEADER),
  }),
);
