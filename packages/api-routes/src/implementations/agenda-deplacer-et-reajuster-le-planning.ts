import { agendaReplanRoutes } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { applyReplan, getReplanOptions, getSlotAlternatives, moveSlot } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `agenda-deplacer-et-reajuster-le-planning` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const agendaDeplacerEtReajusterLePlanningImplementations = {
  formationReplanOptions: ({
    ctx,
    params,
  }: HandlerArgs<typeof agendaReplanRoutes.formationReplanOptions>) =>
    getReplanOptions(ctx, params.fid),
  formationReplan: ({
    ctx,
    params,
    body,
  }: HandlerArgs<typeof agendaReplanRoutes.formationReplan>) => applyReplan(ctx, params.fid, body),
  slotAlternativesGet: ({
    ctx,
    params,
  }: HandlerArgs<typeof agendaReplanRoutes.slotAlternativesGet>) =>
    getSlotAlternatives(ctx, params.sid),
  slotMove: ({ ctx, params, body }: HandlerArgs<typeof agendaReplanRoutes.slotMove>) =>
    moveSlot(ctx, params.sid, body),
};
