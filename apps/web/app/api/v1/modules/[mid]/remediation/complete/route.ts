import { completeRemediation as completeRemediationRoute } from '@learny/contracts';
import { completeRemediation } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-612 ET-2 — the learner terminates the remediation once every question is checked.
export const POST = handler(completeRemediationRoute, ({ ctx, params }) =>
  completeRemediation(ctx, params.mid),
);
