import {
  acceptAutomationAction,
  declineAutomationAction,
  listMyAutomationActions,
  listMyAutomations,
  undoAutomationAction,
  updateMyAutomationSetting,
} from '@learny/automations';
import {
  meAutomationActionAccept,
  meAutomationActionDecline,
  meAutomationActionUndo,
  meAutomationActionsList,
  meAutomationsList,
  meAutomationsUpdate,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';

// SPEC-1004 ET-1 - implementations of the `moteur-d-automatismes` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const moteurDAutomatismesImplementations = {
  meAutomationActionAccept: ({ ctx, params, body }: HandlerArgs<typeof meAutomationActionAccept>) =>
    acceptAutomationAction(ctx, { actionId: params.id, choice: body.choice }),
  meAutomationActionDecline: ({ ctx, params }: HandlerArgs<typeof meAutomationActionDecline>) =>
    declineAutomationAction(ctx, { actionId: params.id }),
  meAutomationActionUndo: ({ ctx, params }: HandlerArgs<typeof meAutomationActionUndo>) =>
    undoAutomationAction(ctx, { actionId: params.id }),
  meAutomationActionsList: ({ ctx, query }: HandlerArgs<typeof meAutomationActionsList>) =>
    listMyAutomationActions(ctx, query),
  meAutomationsList: ({ ctx }: HandlerArgs<typeof meAutomationsList>) => listMyAutomations(ctx),
  meAutomationsUpdate: ({ ctx, body }: HandlerArgs<typeof meAutomationsUpdate>) =>
    updateMyAutomationSetting(ctx, body),
};
