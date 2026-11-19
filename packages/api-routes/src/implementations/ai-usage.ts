import { aiUsage } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getAiUsage } from '@learny/services/ai';

// SPEC-1004 ET-1 - implementations of the `ai` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const aiUsageImplementations = {
  aiUsage: ({ ctx, query }: HandlerArgs<typeof aiUsage>) => getAiUsage(ctx, query),
};
