import { searchGlobal } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { searchUserContent } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `search` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const searchImplementations = {
  searchGlobal: ({ ctx, query }: HandlerArgs<typeof searchGlobal>) => searchUserContent(ctx, query),
};
