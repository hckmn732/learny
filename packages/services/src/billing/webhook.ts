// Stripe webhook processing (SPEC-210 EF-4, ET-4, ET-5, CL-1 to CL-3, CL-9; ADR-0215).
//
// One transaction: the event is claimed in `stripe_events` (a duplicate stops there), the learner's
// subscription row is locked, an event older than the last one applied is dropped, then the
// subscription is READ AGAIN from Stripe and the row is updated from that state. The events that
// follow a change are written in the same transaction (outbox) and sent after the commit.
import { eq } from 'drizzle-orm';

import type { WebhookResult } from '@learny/contracts';
import { AppError } from '@learny/core';
import { schema, type DbTx } from '@learny/db';
import { withTransaction, type EventOutbox } from '@learny/jobs';

import { resolveBillingDeps, type BillingDeps } from './deps';
import { isKnownStripeStatus, mapStripeStatus, maskStripeId } from './status';
import { isHandledEventType, type StripeEvent } from './stripe-event';

const { subscriptions, stripeEvents } = schema;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WebhookInput {
  /** The raw body, exactly as received (a re-serialised body would break the signature). */
  payload: string;
  signature: string | null;
}

export interface WebhookOutcome {
  result: WebhookResult;
  userId: string | null;
  eventId: string;
  type: string;
}

type Row = typeof subscriptions.$inferSelect;

async function markProcessed(tx: DbTx, eventId: string, now: Date): Promise<void> {
  await tx.update(stripeEvents).set({ processedAt: now }).where(eq(stripeEvents.eventId, eventId));
}

async function findRow(tx: DbTx, event: StripeEvent): Promise<Row | undefined> {
  if (event.userId !== null && UUID.test(event.userId)) {
    const [byUser] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, event.userId))
      .for('update');
    if (byUser !== undefined) return byUser;
  }
  if (event.customerId !== null) {
    const [byCustomer] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, event.customerId))
      .for('update');
    return byCustomer;
  }
  return undefined;
}

async function applyEvent(
  tx: DbTx,
  outbox: EventOutbox,
  event: StripeEvent,
  deps: BillingDeps,
): Promise<{ result: WebhookResult; userId: string | null }> {
  const now = deps.clock.now();
  const claimed = await tx
    .insert(stripeEvents)
    .values({ eventId: event.id, type: event.type, createdAt: new Date(event.created * 1000) })
    .onConflictDoNothing()
    .returning({ eventId: stripeEvents.eventId });
  if (claimed.length === 0) return { result: 'duplicate', userId: event.userId };

  const row = await findRow(tx, event);
  if (row === undefined) {
    // CL-9 — a customer we do not know: acknowledged, kept as processed, never a new user.
    await markProcessed(tx, event.id, now);
    deps.logger.error(`stripe event for an unknown customer ${maskStripeId(event.customerId)}`, {
      operation: 'stripe.webhook',
      outcome: 'unknown_customer',
    });
    return { result: 'unknown_customer', userId: null };
  }

  // CL-2 — an older event never overwrites a newer state.
  if (row.stripeEventAt !== null && event.created * 1000 < row.stripeEventAt.getTime()) {
    await markProcessed(tx, event.id, now);
    return { result: 'stale', userId: row.userId };
  }

  const subscriptionId = event.subscriptionId ?? row.stripeSubscriptionId;
  if (subscriptionId === null) {
    await markProcessed(tx, event.id, now);
    deps.logger.warn(`stripe event without subscription (${event.type})`, {
      operation: 'stripe.webhook',
      outcome: 'ignored',
    });
    return { result: 'ignored', userId: row.userId };
  }

  let state;
  try {
    state = await deps.gateway.retrieveSubscription(subscriptionId);
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      await markProcessed(tx, event.id, now);
      deps.logger.error(`stripe subscription not found ${maskStripeId(subscriptionId)}`, {
        operation: 'stripe.webhook',
        outcome: 'ignored',
      });
      return { result: 'ignored', userId: row.userId };
    }
    throw error;
  }

  if (row.stripeCustomerId !== null && row.stripeCustomerId !== state.customerId) {
    await markProcessed(tx, event.id, now);
    deps.logger.error(`stripe customer mismatch ${maskStripeId(state.customerId)}`, {
      operation: 'stripe.webhook',
      outcome: 'unknown_customer',
    });
    return { result: 'unknown_customer', userId: row.userId };
  }

  if (!isKnownStripeStatus(state.status)) {
    deps.logger.warn(`unknown stripe status ${state.status}`, {
      operation: 'stripe.webhook',
      outcome: 'unknown_status',
    });
  }
  const status = mapStripeStatus(state.status);
  await tx
    .update(subscriptions)
    .set({
      status,
      stripeCustomerId: row.stripeCustomerId ?? state.customerId,
      stripeSubscriptionId: state.id,
      currentPeriodEnd: state.currentPeriodEnd,
      stripeEventAt: new Date(event.created * 1000),
      updatedAt: now,
    })
    .where(eq(subscriptions.userId, row.userId));
  await markProcessed(tx, event.id, now);

  // ET-5 — a change of status is announced once; a failed payment always is.
  if (status !== row.status) {
    outbox.add(
      'billing/subscription-changed',
      { userId: row.userId, status, previousStatus: row.status },
      { id: `billing-subscription-changed:${event.id}` },
    );
  }
  if (event.type === 'invoice.payment_failed') {
    outbox.add(
      'billing/payment-failed',
      { userId: row.userId },
      { id: `billing-payment-failed:${event.id}` },
    );
  }
  deps.logger.info(
    `stripe ${event.type} applied for ${maskStripeId(state.customerId)}: ${row.status} → ${status}`,
    { operation: 'stripe.webhook', outcome: 'applied' },
  );
  return { result: 'applied', userId: row.userId };
}

/**
 * EF-4 — verifies the signature, then applies the event. Always resolves with a result for a
 * verified event (the route answers 200); an invalid signature throws `INVALID_SIGNATURE`, and a
 * Stripe outage during the re-read throws, which rolls the claim back so Stripe delivers again.
 */
export async function handleWebhook(
  input: WebhookInput,
  overrides: Partial<BillingDeps> = {},
): Promise<WebhookOutcome> {
  const deps = await resolveBillingDeps(overrides);
  const event = deps.gateway.constructEvent(input.payload, input.signature, deps.clock.now());

  let outcome: { result: WebhookResult; userId: string | null };
  if (!isHandledEventType(event.type)) {
    outcome = { result: 'ignored', userId: event.userId };
  } else {
    outcome = await withTransaction(deps.db, (tx, outbox) => applyEvent(tx, outbox, event, deps), {
      db: deps.db,
      clock: deps.clock,
      logger: deps.logger,
    });
  }
  deps.journal?.add({
    eventId: event.id,
    type: event.type,
    userId: outcome.userId ?? event.userId,
    at: deps.clock.now().toISOString(),
    result: outcome.result,
    payload: input.payload,
  });
  return { ...outcome, eventId: event.id, type: event.type };
}
