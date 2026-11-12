import { billingCheckout } from '@learny/contracts';
import { startCheckout } from '@learny/services/billing';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-210 EF-1: opens a Stripe Checkout session; the Idempotency-Key also keys the Stripe session.
export const POST = handler(billingCheckout, ({ ctx, body, request }) =>
  startCheckout(ctx, body, { idempotencyKey: request.headers.get('idempotency-key') }),
);
