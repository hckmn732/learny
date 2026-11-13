import { moduleGenerateCourse } from '@learny/contracts';
import { generateCourseNow } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-607 EF-4 — explicit generation even while a chapter is open (event written after commit).
export const POST = handler(moduleGenerateCourse, ({ ctx, params }) =>
  generateCourseNow(ctx, params.mid),
);
