import { sidebarGet, sidebarUpdate } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getSidebar, updateSidebar } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `sidebar` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const sidebarImplementations = {
  sidebarGet: ({ ctx }: HandlerArgs<typeof sidebarGet>) => getSidebar(ctx),
  sidebarUpdate: ({ ctx, body }: HandlerArgs<typeof sidebarUpdate>) => updateSidebar(ctx, body),
};
