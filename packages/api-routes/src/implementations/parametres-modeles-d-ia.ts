import { meAiModelsGet, meAiModelsUpdate } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getAiModelsState, updateAiModels } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `parametres-modeles-d-ia` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const parametresModelesDIaImplementations = {
  meAiModelsGet: ({ ctx }: HandlerArgs<typeof meAiModelsGet>) => getAiModelsState(ctx),
  meAiModelsUpdate: ({ ctx, body }: HandlerArgs<typeof meAiModelsUpdate>) =>
    updateAiModels(ctx, body),
};
