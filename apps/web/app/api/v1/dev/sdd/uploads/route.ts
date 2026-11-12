import { devUploadSimulation } from '@learny/contracts';
import { simulateUpload } from '@learny/services';

import { devOnly } from '../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-206 (EF-7): simulated sizes through the real checks of the service.
export const POST = devOnly(
  handler(devUploadSimulation, ({ ctx, body }) => simulateUpload(ctx, body)),
);
