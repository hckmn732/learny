import { notionGraph } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getNotionGraph } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `notion-graph` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const notionGraphImplementations = {
  notionGraph: ({ ctx, params }: HandlerArgs<typeof notionGraph>) =>
    getNotionGraph(ctx, { formationId: params.fid }),
};
