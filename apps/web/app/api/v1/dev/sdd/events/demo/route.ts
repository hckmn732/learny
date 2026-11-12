import { devEventsDemoStart } from '@learny/contracts';
import { startDemoPipeline } from '@learny/services';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-203: emits the pipeline event through the outbox, never in production.
export const POST = devOnly(
  handler(devEventsDemoStart, ({ ctx, body }) => startDemoPipeline(ctx, body)),
);
