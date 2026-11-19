import { moduleCourse } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getModuleCourse } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `course` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const courseImplementations = {
  moduleCourse: ({ ctx, params, query }: HandlerArgs<typeof moduleCourse>) =>
    getModuleCourse(ctx, params.mid, query.chapitre),
};
