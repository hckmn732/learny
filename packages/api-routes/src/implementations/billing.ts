import {
  billingCheckout,
  billingPortal,
  billingSubscription,
  billingWebhook,
} from '@learny/contracts';
import { AppError } from '@learny/core';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  getSubscription,
  handleWebhook,
  openPortal,
  startCheckout,
} from '@learny/services/billing';

// SPEC-210 EF-4: the webhook body is capped before signature verification (raw body).
const MAX_WEBHOOK_BYTES = 1024 * 1024;

// SPEC-1004 ET-1 - implementations of the `billing` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const billingImplementations = {
  billingCheckout: ({ ctx, body, request }: HandlerArgs<typeof billingCheckout>) =>
    startCheckout(ctx, body, { idempotencyKey: request.headers.get('idempotency-key') }),
  billingPortal: ({ ctx }: HandlerArgs<typeof billingPortal>) => openPortal(ctx),
  billingSubscription: ({ ctx }: HandlerArgs<typeof billingSubscription>) => getSubscription(ctx),
  billingWebhook: async ({ request }: HandlerArgs<typeof billingWebhook>) => {
    const payload = await request.text();
    if (payload.length > MAX_WEBHOOK_BYTES) {
      throw new AppError('PAYLOAD_TOO_LARGE', 'La requête dépasse la taille maximale de 1 Mo.');
    }
    const outcome = await handleWebhook({
      payload,
      signature: request.headers.get('stripe-signature'),
    });
    return { received: true as const, result: outcome.result };
  },
};
