import { devStripeCheckoutPay } from '@learny/contracts';
import { payMockCheckout } from '@learny/services/billing';

import { devOnly } from '../../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Demonstration route of SPEC-210: « Payer » on the simulated Checkout page.
export const POST = devOnly(
  handler(devStripeCheckoutPay, async ({ ctx, body }) => {
    const { redirectTo } = await payMockCheckout(ctx, body.sessionId);
    return { redirectTo };
  }),
);
