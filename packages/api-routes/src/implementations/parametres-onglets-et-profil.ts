import { meProfileGet, meProfileUpdate } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getSettingsState, updateSettingsProfile } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `parametres-onglets-et-profil` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const parametresOngletsEtProfilImplementations = {
  meProfileGet: ({ ctx }: HandlerArgs<typeof meProfileGet>) => getSettingsState(ctx),
  meProfileUpdate: ({ ctx, body }: HandlerArgs<typeof meProfileUpdate>) =>
    updateSettingsProfile(ctx, body),
};
