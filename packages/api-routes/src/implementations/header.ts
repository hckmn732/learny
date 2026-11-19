import { headerGet } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getHeader } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `header` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const headerImplementations = {
  headerGet: ({ ctx }: HandlerArgs<typeof headerGet>) => getHeader(ctx),
};
