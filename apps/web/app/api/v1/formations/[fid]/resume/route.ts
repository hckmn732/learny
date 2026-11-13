import { formationManagementRoutes } from '@learny/contracts';
import { resumeFormation } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-618 — resumes one formation, applies the three-active limit and replans from today.
export const POST = handler(formationManagementRoutes.formationResume, ({ ctx, params, body }) =>
  resumeFormation(ctx, params.fid, body),
);
