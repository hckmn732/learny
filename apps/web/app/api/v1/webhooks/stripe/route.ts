import { billingWebhook } from '@learny/contracts';
import { AppError } from '@learny/core';
import { handleWebhook } from '@learny/services/billing';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_WEBHOOK_BYTES = 1024 * 1024;

// SPEC-210 EF-4: public route authenticated by the Stripe signature of the RAW body (a parsed body
// would no longer match it). It lives under /api/v1/webhooks/*, which the origin guard exempts.
export const POST = handler(billingWebhook, async ({ request }) => {
  const payload = await request.text();
  if (payload.length > MAX_WEBHOOK_BYTES) {
    throw new AppError('PAYLOAD_TOO_LARGE', 'La requête dépasse la taille maximale de 1 Mo.');
  }
  const outcome = await handleWebhook({
    payload,
    signature: request.headers.get('stripe-signature'),
  });
  return { received: true as const, result: outcome.result };
});
