import { devSddStripeCheckout } from '@learny/contracts';
import { AppError } from '@learny/core';
import { devRoutesEnabled } from '@learny/http/dev-guard';
import { readIdempotencyKey } from '@learny/http/idempotency';
import type { HandlerArgs } from '@learny/http/route-handler';
import { getMockCheckoutSession } from '@learny/services/billing';

// SPEC-210 EF-7 — the session read by the simulated Stripe checkout page, the only `dev.sdd.*`
// operation kept as e2e harness (ADR-2041). Never served when the development routes are off.
export const devStripeSessionImplementations = {
  devSddStripeCheckout: async ({ body, request }: HandlerArgs<typeof devSddStripeCheckout>) => {
    if (!devRoutesEnabled()) throw new AppError('NOT_FOUND', 'Ressource introuvable.');
    readIdempotencyKey(request.headers.get('idempotency-key'));
    try {
      return {
        sessionId:
          body.id !== undefined && (await getMockCheckoutSession(body.id))?.status === 'open'
            ? body.id
            : null,
      };
    } catch (error) {
      if (error instanceof AppError && error.code === 'CONFLICT') return { sessionId: null };
      throw error;
    }
  },
} as const;
