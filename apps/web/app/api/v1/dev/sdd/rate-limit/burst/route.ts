import { devRateLimitBurst } from '@learny/contracts';
import { runBurst } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration of SPEC-208: a burst of capacity + 1 requests on a synthetic bucket.
export const POST = devOnly(
  handler(devRateLimitBurst, async ({ ctx, body }) => runBurst(ctx.clock, body.profile)),
);
