// Stripe statuses → application statuses, and masking of Stripe identifiers (SPEC-210 EF-5, ET-6;
// ADR-0215). Pure functions: no I/O, no clock.
import type { SubscriptionStatus } from '@learny/contracts';

/**
 * EF-5 — `active`/`trialing` → `active`; `past_due`/`unpaid` → `past_due`;
 * `canceled`/`incomplete_expired` → `canceled`; `incomplete` → `incomplete`.
 *
 * `paused` (a trial that ended without a payment method) grants nothing and can be resumed from the
 * portal: it reads as `past_due`. Any status Stripe adds later reads as `incomplete`, which grants
 * nothing either: the entitlement fails closed (ADR-0262).
 */
export function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'incomplete';
  }
}

/** True for a status Stripe documents (the others are mapped to `incomplete`, and logged). */
export function isKnownStripeStatus(stripeStatus: string): boolean {
  return [
    'active',
    'trialing',
    'past_due',
    'unpaid',
    'paused',
    'canceled',
    'incomplete_expired',
    'incomplete',
  ].includes(stripeStatus);
}

/** ET-6 — `cus_1Abc23XyZ` → `cus_…3XyZ`: the kind of object and the last four characters only. */
export function maskStripeId(id: string | null | undefined): string {
  if (id === null || id === undefined || id === '') return '—';
  const separator = id.indexOf('_');
  const kind = separator > 0 && separator <= 8 ? id.slice(0, separator + 1) : '';
  return `${kind}…${id.slice(-4)}`;
}
