// Checkout, customer portal and subscription reading (SPEC-210 EF-1, EF-2, EF-3, CL-5, CL-6, CL-8).
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import {
  isSafeRelativePath,
  type BillingUrlOutput,
  type CheckoutBody,
  type SubscriptionOutput,
} from '@learny/contracts';
import { AppError } from '@learny/core';
import { schema } from '@learny/db';

import type { ServiceContext } from '../context';

import { resolveBillingDeps, type BillingDeps } from './deps';
import { hasManagedAi } from './entitlement';
import { maskStripeId } from './status';

const { subscriptions, profiles } = schema;

/** EF-3 — cap applied to an account that never subscribed (data-model §9). */
export const DEFAULT_DAILY_CAP_USD = 1.5;

/** `/parametres#ia` — where the portal sends the learner back (EF-2). */
export const PORTAL_RETURN_PATH = '/parametres#ia';

function requireUser(ctx: Pick<ServiceContext, 'userId'>): string {
  if (ctx.userId === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  return ctx.userId;
}

function invalidPath(field: 'successPath' | 'cancelPath'): AppError {
  return new AppError('VALIDATION_FAILED', 'Chemin de retour invalide.', {
    errors: [{ path: field, message: 'Le chemin doit être interne à l’application.' }],
  });
}

/** CL-5 — a relative path, and an address that stays on the application's origin. */
function absoluteUrl(path: string, appUrl: string, field: 'successPath' | 'cancelPath'): string {
  if (!isSafeRelativePath(path)) throw invalidPath(field);
  const url = new URL(path, `${appUrl}/`);
  if (url.origin !== new URL(appUrl).origin) throw invalidPath(field);
  return url.toString();
}

export interface StartCheckoutOptions {
  /** Value of the `Idempotency-Key` header: one Stripe session per key (CL-6). */
  idempotencyKey?: string | null;
}

/**
 * EF-1 — creates the Stripe customer on the first call (metadata.userId, profile e-mail), reuses it
 * afterwards, and opens a Checkout session. The learner's row is locked for the whole call, so two
 * simultaneous clicks create a single customer (CL-6); a Stripe outage rolls everything back and
 * leaves no partial row (CL-8).
 */
export async function startCheckout(
  ctx: Pick<ServiceContext, 'userId'>,
  input: CheckoutBody,
  options: StartCheckoutOptions = {},
  overrides: Partial<BillingDeps> = {},
): Promise<BillingUrlOutput> {
  const userId = requireUser(ctx);
  const deps = await resolveBillingDeps(overrides);
  const successUrl = absoluteUrl(input.successPath, deps.config.appUrl, 'successPath');
  const cancelUrl = absoluteUrl(input.cancelPath, deps.config.appUrl, 'cancelPath');

  const url = await deps.db.transaction(async (tx) => {
    await tx.insert(subscriptions).values({ userId }).onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .for('update');
    if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Abonnement introuvable.');
    if (row.status === 'active') {
      throw new AppError('ALREADY_SUBSCRIBED', 'Votre abonnement à l’IA fournie est déjà actif.');
    }

    let customerId = row.stripeCustomerId;
    if (customerId === null) {
      const [profile] = await tx
        .select({ email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, userId));
      const customer = await deps.gateway.createCustomer({
        userId,
        email: profile?.email ?? null,
        idempotencyKey: `customer:${userId}`,
      });
      customerId = customer.id;
      await tx
        .update(subscriptions)
        .set({ stripeCustomerId: customerId, updatedAt: deps.clock.now() })
        .where(eq(subscriptions.userId, userId));
    }

    const session = await deps.gateway.createCheckoutSession({
      customerId,
      userId,
      successUrl,
      cancelUrl,
      successPath: input.successPath,
      cancelPath: input.cancelPath,
      idempotencyKey: `checkout:${userId}:${options.idempotencyKey ?? randomUUID()}`,
    });
    deps.logger.info(`stripe checkout opened for ${maskStripeId(customerId)}`, {
      operation: 'billing.checkout',
      outcome: 'opened',
    });
    return session.url;
  });
  return { url };
}

/** EF-2 — the customer portal; a learner without a Stripe customer gets `NOT_FOUND`. */
export async function openPortal(
  ctx: Pick<ServiceContext, 'userId'>,
  overrides: Partial<BillingDeps> = {},
): Promise<BillingUrlOutput> {
  const userId = requireUser(ctx);
  const deps = await resolveBillingDeps(overrides);
  const [row] = await deps.db
    .select({ customerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  if (row?.customerId === null || row === undefined) {
    throw new AppError('NOT_FOUND', 'Aucun abonnement à gérer.');
  }
  const session = await deps.gateway.createPortalSession({
    customerId: row.customerId,
    returnUrl: absoluteUrl(PORTAL_RETURN_PATH, deps.config.appUrl, 'successPath'),
    returnPath: PORTAL_RETURN_PATH,
  });
  return { url: session.url };
}

/** EF-3 — status, end of period, entitlement (decided by `hasManagedAi`) and daily cap. */
export async function getSubscription(
  ctx: Pick<ServiceContext, 'userId' | 'clock'>,
  overrides: Partial<BillingDeps> = {},
): Promise<SubscriptionOutput> {
  const userId = requireUser(ctx);
  const db = overrides.db ?? (await resolveBillingDeps(overrides)).db;
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  const entitled = await hasManagedAi(userId, { db, clock: ctx.clock });
  return {
    status: row?.status ?? 'none',
    currentPeriodEnd: row?.currentPeriodEnd?.toISOString() ?? null,
    hasManagedAi: entitled,
    dailyCapUsd: row === undefined ? DEFAULT_DAILY_CAP_USD : Number(row.dailyCapUsd),
  };
}
