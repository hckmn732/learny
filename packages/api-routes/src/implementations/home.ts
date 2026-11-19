import { homeGet } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getHome } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `home` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const homeImplementations = {
  homeGet: ({ ctx }: HandlerArgs<typeof homeGet>) => getHome(ctx),
};
