import {
  chapterSummary,
  courseCitationSource,
  courseProgress,
  courseSectionEdit,
  courseSectionReport,
} from '@learny/contracts';
import { IDEMPOTENCY_KEY_HEADER } from '@learny/http/idempotency';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  editCourseSection,
  getCitationSource,
  recordCourseProgress,
  reportCourseSection,
  submitChapterSummary,
} from '@learny/services';

import { resourceDeps } from '../deps/resource-deps';

// SPEC-1004 ET-1 - implementations of the `course-reading` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const courseReadingImplementations = {
  chapterSummary: ({ ctx, params, body, request }: HandlerArgs<typeof chapterSummary>) =>
    submitChapterSummary(ctx, params.cid, {
      ...body,
      requestKey: request.headers.get(IDEMPOTENCY_KEY_HEADER),
    }),
  courseCitationSource: ({ ctx, params }: HandlerArgs<typeof courseCitationSource>) =>
    getCitationSource(ctx, resourceDeps(), params.cid),
  courseSectionReport: ({ ctx, params, body, request }: HandlerArgs<typeof courseSectionReport>) =>
    reportCourseSection(ctx, params.sid, {
      ...body,
      requestKey: request.headers.get(IDEMPOTENCY_KEY_HEADER),
    }),
  courseSectionEdit: ({ ctx, params, body, request }: HandlerArgs<typeof courseSectionEdit>) =>
    editCourseSection(ctx, params.sid, {
      ...body,
      requestKey: request.headers.get(IDEMPOTENCY_KEY_HEADER),
    }),
  courseProgress: ({ ctx, params, body }: HandlerArgs<typeof courseProgress>) =>
    recordCourseProgress(ctx, params.cid, body),
};
