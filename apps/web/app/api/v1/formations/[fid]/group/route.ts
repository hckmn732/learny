import { formationGroupCreate, formationGroupGet } from '@learny/contracts';
import { createFormationGroup, getFormationGroup } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-724 ET-3 — group of a shared formation. The GET returns the limited member projection;
// the POST creates the code and the ten seats, only for the owner of an active formation.
export const GET = handler(formationGroupGet, ({ ctx, params }) =>
  getFormationGroup(ctx, params.fid),
);

export const POST = handler(formationGroupCreate, ({ ctx, params }) =>
  createFormationGroup(ctx, params.fid),
);
