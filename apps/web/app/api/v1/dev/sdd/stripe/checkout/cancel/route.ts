import { devStripeCheckoutCancel } from '@learny/contracts';
import { cancelMockCheckout } from '@learny/services/billing';

import { devOnly } from '../../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Demonstration route of SPEC-210: « Annuler » on the simulated Checkout page.
export const POST = devOnly(
  handler(devStripeCheckoutCancel, ({ ctx, body }) => cancelMockCheckout(ctx, body.sessionId)),
);
