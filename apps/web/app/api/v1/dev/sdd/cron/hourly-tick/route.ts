import { devCronHourlyTick } from '@learny/contracts';
import { previewHourlyTick } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-203: runs the hourly tick selection for the factory users.
export const POST = devOnly(
  handler(devCronHourlyTick, ({ ctx, body }) => previewHourlyTick(ctx, body)),
);
