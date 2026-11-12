import { devEcho as devEchoRoute } from '@learny/contracts';
import { devEcho } from '@learny/services';

import { devOnly } from '../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-201: authenticated, idempotent, never active in production.
export const POST = devOnly(
  handler(devEchoRoute, ({ ctx, body }) => Promise.resolve(devEcho(ctx, body))),
);
