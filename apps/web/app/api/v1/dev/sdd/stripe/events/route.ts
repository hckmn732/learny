import { devStripeEvents } from '@learny/contracts';
import { listStripeEvents } from '@learny/services/billing';

import { devOnly } from '../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Demonstration route of SPEC-210: the webhooks received by the simulated Stripe.
export const GET = devOnly(
  handler(devStripeEvents, async ({ ctx }) => ({ items: await listStripeEvents(ctx) })),
);
