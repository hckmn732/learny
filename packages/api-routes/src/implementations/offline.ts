import { offlinePack, offlineSync } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { buildPack, syncOfflineAnswers } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `offline` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const offlineImplementations = {
  offlinePack: ({ ctx }: HandlerArgs<typeof offlinePack>) => buildPack(ctx),
  offlineSync: ({ ctx, body }: HandlerArgs<typeof offlineSync>) =>
    syncOfflineAnswers(ctx, body.entries),
};
