import { meLegalAccept } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { acceptLegalVersions } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `legal` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const legalImplementations = {
  meLegalAccept: ({ ctx, body }: HandlerArgs<typeof meLegalAccept>) =>
    acceptLegalVersions(ctx, body),
};
