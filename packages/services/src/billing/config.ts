// Billing configuration read from the environment (SPEC-210 §3, ADR-0215). `STRIPE_MODE=mock` is
// refused in production here too (defence in depth: SPEC-009 already refuses it at startup).
import { STRIPE_MODES, type StripeMode } from '@learny/config';
import { AppError } from '@learny/core';

type Env = Readonly<Record<string, string | undefined>>;

export interface BillingConfig {
  mode: StripeMode;
  secretKey: string | undefined;
  webhookSecret: string | undefined;
  priceId: string | undefined;
  /** Public origin of the application, without a trailing slash. */
  appUrl: string;
}

/** Seconds a signed webhook stays acceptable (ADR-0215). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

function defaultMode(appEnv: string | undefined): StripeMode {
  if (appEnv === 'production') return 'live';
  if (appEnv === 'preview') return 'test';
  return 'mock';
}

export function resolveBillingConfig(env: Env = process.env): BillingConfig {
  const requested = env.STRIPE_MODE?.trim();
  const mode = (STRIPE_MODES as readonly string[]).includes(requested ?? '')
    ? (requested as StripeMode)
    : defaultMode(env.APP_ENV);
  if (mode === 'mock' && env.APP_ENV === 'production') {
    throw new AppError('INTERNAL_ERROR', 'STRIPE_MODE=mock est interdit en production.');
  }
  const clean = (value: string | undefined): string | undefined =>
    value === undefined || value.trim() === '' ? undefined : value.trim();
  return {
    mode,
    secretKey: clean(env.STRIPE_SECRET_KEY),
    webhookSecret: clean(env.STRIPE_WEBHOOK_SECRET),
    priceId: clean(env.STRIPE_PRICE_ID),
    appUrl: (clean(env.NEXT_PUBLIC_APP_URL) ?? 'http://localhost:3000').replace(/\/+$/, ''),
  };
}
