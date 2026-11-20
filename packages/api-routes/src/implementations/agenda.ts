import { agendaGet } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getAgenda } from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `agenda` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const agendaImplementations = {
  agendaGet: ({ ctx, query }: HandlerArgs<typeof agendaGet>) => getAgenda(ctx, query),
};
