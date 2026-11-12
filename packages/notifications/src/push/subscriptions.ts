// Browser push subscriptions of a learner (SPEC-205 EF-1, EF-2, ET-1, CL-3, CL-7).
//
// Every write goes through the Row Level Security client of the caller: a learner only ever sees
// and touches their own rows. The `unique(endpoint)` constraint is what keeps one endpoint on one
// account; when the insert trips it, the endpoint belongs to someone else and the answer is a
// neutral refusal that neither confirms nor describes the other row (CL-3, ADR-0261).
import { and, eq } from 'drizzle-orm';

import type { PushSubscriptionBody, PushSubscriptionOutput } from '@learny/contracts';
import { AppError, err, ok, type Result } from '@learny/core';
import { pushSubscriptions, type PushSubscription } from '@learny/db';

import type { PushUserContext } from './context';

function requireUser(ctx: PushUserContext): {
  userId: string;
  db: NonNullable<PushUserContext['db']>;
} {
  if (ctx.userId === null || ctx.db === null) {
    throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté pour effectuer cette action.');
  }
  return { userId: ctx.userId, db: ctx.db };
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === '23505') return true;
    current = candidate.cause;
  }
  return false;
}

function toOutput(row: PushSubscription, created: boolean): PushSubscriptionOutput {
  return {
    id: row.id,
    created,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * EF-1 — creates the subscription of the current browser, or refreshes its keys when the caller
 * already registered this endpoint (idempotent on endpoint + owner). An endpoint registered by
 * another account is refused with a neutral `FORBIDDEN` (CL-3).
 */
export async function upsertPushSubscription(
  ctx: PushUserContext,
  input: PushSubscriptionBody,
): Promise<Result<PushSubscriptionOutput>> {
  const { userId, db } = requireUser(ctx);
  const now = ctx.clock.now();
  const userAgent =
    input.userAgent === undefined || input.userAgent === '' ? null : input.userAgent;
  try {
    return await db.run(async (tx) => {
      const existing = await tx
        .select()
        .from(pushSubscriptions)
        .where(
          and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, input.endpoint)),
        );
      const current = existing[0];
      if (current !== undefined) {
        const updated = await tx
          .update(pushSubscriptions)
          .set({ p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent, updatedAt: now })
          .where(eq(pushSubscriptions.id, current.id))
          .returning();
        return ok(toOutput(updated[0] ?? { ...current, updatedAt: now }, false));
      }
      const inserted = await tx
        .insert(pushSubscriptions)
        .values({
          userId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const row = inserted[0];
      if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Abonnement non enregistré.');
      return ok(toOutput(row, true));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      ctx.logger.warn('push subscription refused', {
        code: 'FORBIDDEN',
        outcome: 'foreign_endpoint',
      });
      return err(
        new AppError('FORBIDDEN', 'Cet abonnement ne peut pas être enregistré sur ce compte.'),
      );
    }
    throw error;
  }
}

/**
 * EF-2 — removes the subscription of the current browser. Row Level Security scopes the delete
 * to the caller: an unknown or foreign endpoint deletes nothing and answers the same success.
 */
export async function removePushSubscription(
  ctx: PushUserContext,
  input: { endpoint: string },
): Promise<Result<{ removed: number }>> {
  const { userId, db } = requireUser(ctx);
  const removed = await db.run(async (tx) =>
    tx
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, input.endpoint)),
      )
      .returning({ id: pushSubscriptions.id }),
  );
  return ok({ removed: removed.length });
}

/** The active subscriptions of the caller, oldest first (settings page, demonstration). */
export async function listPushSubscriptions(ctx: PushUserContext): Promise<PushSubscription[]> {
  const { userId, db } = requireUser(ctx);
  return db.run((tx) =>
    tx
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(pushSubscriptions.createdAt, pushSubscriptions.id),
  );
}
