import { mePauseDiagnostic, mePauseEnd, mePauseGet, mePauseStart } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { completePauseDiagnostic, endPause, getPauseState, startPause } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `automatisme-10-mode-pause-et-retour` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const automatisme10ModePauseEtRetourImplementations = {
  mePauseDiagnostic: ({ ctx, body }: HandlerArgs<typeof mePauseDiagnostic>) =>
    completePauseDiagnostic(ctx, body),
  mePauseGet: ({ ctx }: HandlerArgs<typeof mePauseGet>) => getPauseState(ctx),
  mePauseStart: ({ ctx, body }: HandlerArgs<typeof mePauseStart>) => startPause(ctx, body),
  mePauseEnd: ({ ctx }: HandlerArgs<typeof mePauseEnd>) => endPause(ctx),
};
