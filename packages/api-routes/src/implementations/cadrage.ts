import { cadrageRoutes, formationRoutes } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  completeCadrage,
  createFormation,
  getCadragePageState,
  getCadrageState,
  listFormations,
  postCadrageMessage,
  updateFormationTitle,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `cadrage` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const cadrageImplementations = {
  cadragePageGet: ({ ctx, params }: HandlerArgs<typeof cadrageRoutes.cadragePageGet>) =>
    getCadragePageState(ctx, params.fid),
  cadrageComplete: ({ ctx, params }: HandlerArgs<typeof cadrageRoutes.cadrageComplete>) =>
    completeCadrage(ctx, params.fid),
  cadrageGet: ({ ctx, params }: HandlerArgs<typeof cadrageRoutes.cadrageGet>) =>
    getCadrageState(ctx, params.fid),
  cadrageMessageCreate: ({
    ctx,
    params,
    body,
  }: HandlerArgs<typeof cadrageRoutes.cadrageMessageCreate>) =>
    postCadrageMessage(ctx, params.fid, body),
  formationUpdate: ({ ctx, params, body }: HandlerArgs<typeof formationRoutes.formationUpdate>) =>
    updateFormationTitle(ctx, params.fid, body),
  formationsList: ({ ctx }: HandlerArgs<typeof formationRoutes.formationsList>) =>
    listFormations(ctx),
  formationsCreate: ({ ctx, body }: HandlerArgs<typeof formationRoutes.formationsCreate>) =>
    createFormation(ctx, body),
};
