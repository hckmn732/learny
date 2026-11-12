import { z } from 'zod';

import { WebhookResult } from './billing';
import { IsoDateTime } from './common';
import { defineRoute } from './define-route';

// Demonstration routes of SPEC-210 (ENABLE_SDD_PAGES only, never in production, simulated Stripe
// only): the failed payment, the cancellation and the replay of a webhook, the history of the
// webhooks received, and the two buttons of the simulated Checkout page (EF-7, EF-8).
export const SIMULATED_ACTIONS = ['payment-failed', 'cancel', 'replay'] as const;
export const SimulateBody = z.object({ action: z.enum(SIMULATED_ACTIONS) });
export type SimulateBody = z.infer<typeof SimulateBody>;

export const SimulateOutput = z.object({ result: WebhookResult });

export const StripeEventLine = z.object({
  eventId: z.string(),
  type: z.string(),
  at: IsoDateTime,
  result: WebhookResult,
});
export type StripeEventLine = z.infer<typeof StripeEventLine>;

export const StripeEventsOutput = z.object({ items: z.array(StripeEventLine) });

/** Identifier of a simulated Checkout session (`cs_mock_<n>`). */
export const MockSessionBody = z.object({ sessionId: z.string().regex(/^cs_mock_\d{1,9}$/) });
export const MockRedirectOutput = z.object({ redirectTo: z.string().min(1).max(512) });

export const billingDevRoutes = {
  devStripeSimulate: defineRoute({
    id: 'dev.stripe.simulate',
    method: 'POST',
    path: '/api/v1/dev/sdd/stripe/simulate',
    auth: 'user',
    body: SimulateBody,
    output: SimulateOutput,
    successStatus: 200,
    summary: 'Route de démonstration : échec de paiement, résiliation ou rejeu simulés (SPEC-210).',
    errors: ['NOT_FOUND', 'CONFLICT'],
  }),
  devStripeEvents: defineRoute({
    id: 'dev.stripe.events',
    method: 'GET',
    path: '/api/v1/dev/sdd/stripe/events',
    auth: 'user',
    output: StripeEventsOutput,
    successStatus: 200,
    summary: 'Route de démonstration : historique des webhooks Stripe simulés (SPEC-210).',
    errors: ['CONFLICT'],
  }),
  devStripeCheckoutPay: defineRoute({
    id: 'dev.stripe.checkoutPay',
    method: 'POST',
    path: '/api/v1/dev/sdd/stripe/checkout/pay',
    auth: 'user',
    body: MockSessionBody,
    output: MockRedirectOutput,
    successStatus: 200,
    summary: 'Route de démonstration : « Payer » sur la page Checkout simulée (SPEC-210).',
    errors: ['NOT_FOUND', 'CONFLICT'],
  }),
  devStripeCheckoutCancel: defineRoute({
    id: 'dev.stripe.checkoutCancel',
    method: 'POST',
    path: '/api/v1/dev/sdd/stripe/checkout/cancel',
    auth: 'user',
    body: MockSessionBody,
    output: MockRedirectOutput,
    successStatus: 200,
    summary: 'Route de démonstration : « Annuler » sur la page Checkout simulée (SPEC-210).',
    errors: ['NOT_FOUND', 'CONFLICT'],
  }),
} as const;
export const { devStripeSimulate, devStripeEvents, devStripeCheckoutPay, devStripeCheckoutCancel } =
  billingDevRoutes;
