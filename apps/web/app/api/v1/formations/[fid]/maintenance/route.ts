import { setMaintenance as setMaintenanceRoute } from '@learny/contracts';
import { setMaintenance } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-617 ET-3 — choose or change the memory interview (light or stopped).
export const POST = handler(setMaintenanceRoute, ({ ctx, params, body }) =>
  setMaintenance(ctx, params.fid, body),
);
