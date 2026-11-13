import { getRemediation, prepareRemediation } from '@learny/contracts';
import {
  getRemediation as getRemediationService,
  requestRemediationPreparation,
} from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-612 ET-2 — read the current remediation, or prepare one on demand (202 preparing).
export const GET = handler(getRemediation, ({ ctx, params }) =>
  getRemediationService(ctx, params.mid),
);

export const POST = handler(prepareRemediation, async ({ ctx, params }) => {
  const result = await requestRemediationPreparation(ctx, params.mid);
  if (!result.ok) return result;
  return Response.json(result.value, { status: 202 });
});
