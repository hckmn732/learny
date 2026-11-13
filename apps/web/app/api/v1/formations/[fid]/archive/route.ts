import { formationManagementRoutes } from '@learny/contracts';
import { archiveFormation } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-618 — archives a formation while keeping its whole history.
export const POST = handler(formationManagementRoutes.formationArchive, ({ ctx, params, body }) =>
  archiveFormation(ctx, params.fid, body),
);
