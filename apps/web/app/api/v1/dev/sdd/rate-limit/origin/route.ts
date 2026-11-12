import { devRateLimitOrigin } from '@learny/contracts';
import { runOriginDemo } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration of SPEC-208: the origin guard applied to a simulated mutation.
export const POST = devOnly(
  handler(devRateLimitOrigin, ({ body }) => Promise.resolve(runOriginDemo(body.mode))),
);
