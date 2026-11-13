import { formationRoutes } from '@learny/contracts';
import { updateFormationTitle } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

export const PATCH = handler(formationRoutes.formationUpdate, ({ ctx, params, body }) =>
  updateFormationTitle(ctx, params.fid, body),
);
