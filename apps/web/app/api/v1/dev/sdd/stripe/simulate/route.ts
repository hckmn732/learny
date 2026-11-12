import { devStripeSimulate } from '@learny/contracts';
import { simulateStripeAction } from '@learny/services/billing';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Demonstration route of SPEC-210: failed payment, cancellation or replay, never in production.
export const POST = devOnly(
  handler(devStripeSimulate, ({ ctx, body }) => simulateStripeAction(ctx, body.action)),
);
