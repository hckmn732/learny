import { devRateLimitPurge } from '@learny/contracts';
import { runPurgeDemo } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration of SPEC-208: the purge of expired idempotency keys and rate-limit buckets.
export const POST = devOnly(handler(devRateLimitPurge, ({ ctx }) => runPurgeDemo(ctx.clock)));
