import { resourcesRetry } from '@learny/contracts';
import { retryResource } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-607 BR-APP-07 — a failed contribution goes back to the queue, with one event per retry.
export const POST = handler(resourcesRetry, ({ ctx, params }) =>
  retryResource(ctx, params.rid),
);
