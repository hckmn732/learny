// Right to the provided AI (SPEC-210 EF-6, BR-IA-06, ADR-0215): `hasManagedAi` is the single place
// that decides it. No cache, no grace period after `past_due`.
import { eq } from 'drizzle-orm';

import { clock as systemClock, type Clock } from '@learny/core';
import { schema, serviceDb, type Db, type SubscriptionStatusValue } from '@learny/db';

const { subscriptions } = schema;

export interface EntitlementInput {
  status: SubscriptionStatusValue;
  currentPeriodEnd: Date | null;
}

/**
 * BR-IA-06 — true only for an `active` subscription whose period is not over. Stripe renews the
 * period before it ends, so an `active` row whose end date has passed means that a webhook was
 * missed: the provided AI stops until the next event (CL-4).
 */
export function isManagedAiEntitled(
  subscription: EntitlementInput | null | undefined,
  now: Date,
): boolean {
  if (subscription === null || subscription === undefined) return false;
  if (subscription.status !== 'active') return false;
  if (subscription.currentPeriodEnd === null) return false;
  return subscription.currentPeriodEnd.getTime() > now.getTime();
}

export interface HasManagedAiOptions {
  /** Owner-role client (default `serviceDb()`): the entitlement is read for any user. */
  db?: Db;
  clock?: Clock;
}

/**
 * EF-6 — reads the subscription on every call (no cache) and decides. The only code that turns a
 * subscription row into a right to the provided AI; SPEC-504 and SPEC-507 call it.
 */
export async function hasManagedAi(
  userId: string,
  options: HasManagedAiOptions = {},
): Promise<boolean> {
  const db = options.db ?? serviceDb();
  const now = (options.clock ?? systemClock).now();
  const [row] = await db
    .select({
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return isManagedAiEntitled(row, now);
}
