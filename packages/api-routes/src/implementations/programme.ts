import { programmeRoutes } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  adjustProposal,
  generateProposal,
  getProgrammeScreenState,
  importProposal,
  validateProposal,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `programme` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const programmeImplementations = {
  programmeAdjust: ({ ctx, params, body }: HandlerArgs<typeof programmeRoutes.programmeAdjust>) =>
    adjustProposal(ctx, params.fid, body),
  programmeGenerate: ({
    ctx,
    params,
    body,
  }: HandlerArgs<typeof programmeRoutes.programmeGenerate>) =>
    generateProposal(ctx, params.fid, body),
  programmeImport: ({ ctx, params, body }: HandlerArgs<typeof programmeRoutes.programmeImport>) =>
    importProposal(ctx, params.fid, body),
  programmeGet: ({ ctx, params, query }: HandlerArgs<typeof programmeRoutes.programmeGet>) =>
    getProgrammeScreenState(ctx, params.fid, query),
  programmeValidate: ({
    ctx,
    params,
    body,
  }: HandlerArgs<typeof programmeRoutes.programmeValidate>) =>
    validateProposal(ctx, params.fid, body),
};
