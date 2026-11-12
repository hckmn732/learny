import { z } from 'zod';

import { IsoDateTime } from './common';
import { defineRoute } from './define-route';
import { EVENT_SUBSCRIPTION_STATUSES } from './events';

// Contracts of the Stripe subscription service (SPEC-210 ET-1, docs/architecture/api.md §2).
// Nothing here carries a Stripe key or a payment identifier: the browser only receives a URL and
// the entitlement derived server-side (ET-6).

/** `subscriptions.status` (data-model §9): the only five states the application knows. */
export const SUBSCRIPTION_STATUSES = EVENT_SUBSCRIPTION_STATUSES;
export const SubscriptionStatus = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const SAFE_PATH_MAX = 512;

/**
 * A path of this application: it starts with one `/`, never `//` (protocol-relative URL) nor `/\`
 * (browsers read a backslash as a slash), and contains no control character or space (CL-5).
 */
export function isSafeRelativePath(value: string): boolean {
  if (value.length < 1 || value.length > SAFE_PATH_MAX) return false;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return false;
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
  return !/[\\\s\u0000-\u001f\u007f]/.test(value);
}

/** Return path of Checkout or of the portal: relative to the application, never an external URL. */
export const SafePath = z.string().refine(isSafeRelativePath, {
  message: 'Le chemin doit être interne à l’application (il commence par « / », sans « // »).',
});

/** EF-1 — where Stripe sends the learner back after paying or giving up. */
export const CheckoutBody = z.object({ successPath: SafePath, cancelPath: SafePath });
export type CheckoutBody = z.infer<typeof CheckoutBody>;

/** EF-1, EF-2 — the hosted page (Stripe, or the simulated page in `STRIPE_MODE=mock`). */
export const BillingUrlOutput = z.object({ url: z.string().min(1).max(2048) });
export type BillingUrlOutput = z.infer<typeof BillingUrlOutput>;

/** EF-3 — the learner's subscription and the entitlement decided by `hasManagedAi`. */
export const SubscriptionOutput = z.object({
  status: SubscriptionStatus,
  currentPeriodEnd: IsoDateTime.nullable(),
  hasManagedAi: z.boolean(),
  dailyCapUsd: z.number().positive(),
});
export type SubscriptionOutput = z.infer<typeof SubscriptionOutput>;

/** EF-4 — how a webhook delivery was treated (always a 200, whatever the outcome). */
export const WEBHOOK_RESULTS = [
  'applied',
  'duplicate',
  'stale',
  'ignored',
  'unknown_customer',
] as const;
export const WebhookResult = z.enum(WEBHOOK_RESULTS);
export type WebhookResult = z.infer<typeof WebhookResult>;

export const WebhookAck = z.object({ received: z.literal(true), result: WebhookResult });
export type WebhookAck = z.infer<typeof WebhookAck>;

export const billingRoutes = {
  billingCheckout: defineRoute({
    id: 'billing.checkout',
    method: 'POST',
    path: '/api/v1/billing/checkout',
    auth: 'user',
    body: CheckoutBody,
    output: BillingUrlOutput,
    successStatus: 200,
    idempotent: true,
    summary: 'Ouvre une session Stripe Checkout pour l’abonnement à l’IA fournie.',
    errors: ['VALIDATION_FAILED', 'ALREADY_SUBSCRIBED', 'SERVICE_UNAVAILABLE'],
  }),
  billingPortal: defineRoute({
    id: 'billing.portal',
    method: 'POST',
    path: '/api/v1/billing/portal',
    auth: 'user',
    output: BillingUrlOutput,
    successStatus: 200,
    summary: 'Ouvre le portail client Stripe (moyen de paiement, résiliation).',
    errors: ['NOT_FOUND', 'SERVICE_UNAVAILABLE'],
  }),
  billingSubscription: defineRoute({
    id: 'billing.subscription',
    method: 'GET',
    path: '/api/v1/billing/subscription',
    auth: 'user',
    output: SubscriptionOutput,
    successStatus: 200,
    summary: 'Abonnement de l’apprenant et droit à l’IA fournie.',
    errors: [],
  }),
  // Public: authenticated by the Stripe signature of the raw body, not by a session. It lives under
  // `/api/v1/webhooks/*`, which the origin guard of SPEC-208 exempts. The body is read raw by the
  // handler (a parsed body would break the signature), so it is not declared as a schema here.
  billingWebhook: defineRoute({
    id: 'billing.webhook',
    method: 'POST',
    path: '/api/v1/webhooks/stripe',
    auth: 'public',
    output: WebhookAck,
    successStatus: 200,
    rateLimit: 'none',
    summary: 'Webhook Stripe signé (en-tête Stripe-Signature, corps brut JSON), idempotent.',
    errors: ['INVALID_SIGNATURE'],
  }),
} as const;
