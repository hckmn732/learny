// Simulation of the Stripe journey for the demonstration pages (SPEC-210 EF-7, EF-8). Only the
// simulated gateway supports it; every function refuses another mode. The webhook is delivered
// through `handleWebhook`, so signature, deduplication and ordering are exercised for real.
import type { WebhookResult } from '@learny/contracts';
import { AppError } from '@learny/core';

import type { ServiceContext } from '../context';

import { resolveBillingDeps, type BillingDeps, type JournalEntry } from './deps';
import {
  isMockGateway,
  type MockCheckoutSession,
  type MockDelivery,
  type MockStripeGateway,
} from './mock-stripe';
import { handleWebhook } from './webhook';

export type SimulatedAction = 'payment-failed' | 'cancel' | 'replay';

interface MockContext {
  deps: BillingDeps;
  gateway: MockStripeGateway;
}

async function mockContext(overrides: Partial<BillingDeps>): Promise<MockContext> {
  const deps = await resolveBillingDeps(overrides);
  if (!isMockGateway(deps.gateway)) {
    throw new AppError('CONFLICT', 'La simulation n’est disponible qu’avec STRIPE_MODE=mock.');
  }
  return { deps, gateway: deps.gateway };
}

function requireUser(ctx: Pick<ServiceContext, 'userId'>): string {
  if (ctx.userId === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  return ctx.userId;
}

async function deliver({ deps }: MockContext, delivery: MockDelivery): Promise<WebhookResult> {
  const outcome = await handleWebhook(
    { payload: delivery.payload, signature: delivery.signature },
    deps,
  );
  return outcome.result;
}

/** The checkout session shown by the simulated page, or `undefined` once the process restarted. */
export async function getMockCheckoutSession(
  sessionId: string,
  overrides: Partial<BillingDeps> = {},
): Promise<MockCheckoutSession | undefined> {
  const { gateway } = await mockContext(overrides);
  return gateway.getCheckoutSession(sessionId);
}

/** « Payer » — completes the session, delivers the signed webhook, returns where to go. */
export async function payMockCheckout(
  ctx: Pick<ServiceContext, 'userId'>,
  sessionId: string,
  overrides: Partial<BillingDeps> = {},
): Promise<{ redirectTo: string; result: WebhookResult }> {
  const userId = requireUser(ctx);
  const mock = await mockContext(overrides);
  const session = mock.gateway.getCheckoutSession(sessionId);
  if (session?.userId !== userId) {
    throw new AppError('NOT_FOUND', 'Session de paiement introuvable.');
  }
  const result = await deliver(mock, mock.gateway.completeCheckout(sessionId));
  return { redirectTo: session.successPath, result };
}

/** « Annuler » — abandons the session and sends the learner back. */
export async function cancelMockCheckout(
  ctx: Pick<ServiceContext, 'userId'>,
  sessionId: string,
  overrides: Partial<BillingDeps> = {},
): Promise<{ redirectTo: string }> {
  const userId = requireUser(ctx);
  const mock = await mockContext(overrides);
  const session = mock.gateway.getCheckoutSession(sessionId);
  if (session?.userId !== userId) {
    throw new AppError('NOT_FOUND', 'Session de paiement introuvable.');
  }
  mock.gateway.cancelCheckout(sessionId);
  return { redirectTo: session.cancelPath };
}

/** EF-8 — failed payment, cancellation, or replay of the learner's last webhook. */
export async function simulateStripeAction(
  ctx: Pick<ServiceContext, 'userId'>,
  action: SimulatedAction,
  overrides: Partial<BillingDeps> = {},
): Promise<{ result: WebhookResult }> {
  const userId = requireUser(ctx);
  const mock = await mockContext(overrides);
  if (action === 'replay') {
    const last = mock.deps.journal?.last(userId);
    if (last === undefined) throw new AppError('NOT_FOUND', 'Aucun webhook à rejouer.');
    // Stripe signs a retry again with the current time; the event identifier stays the same.
    const delivery: MockDelivery = {
      eventId: last.eventId,
      type: last.type,
      created: 0,
      payload: last.payload,
      signature: mock.gateway.sign(last.payload),
    };
    return { result: await deliver(mock, delivery) };
  }
  const subscriptionId = [...mock.gateway.state.subscriptions.values()].find(
    (subscription) => subscription.userId === userId,
  )?.id;
  if (subscriptionId === undefined) {
    throw new AppError('NOT_FOUND', 'Aucun abonnement simulé pour cet utilisateur.');
  }
  const delivery =
    action === 'payment-failed'
      ? mock.gateway.failPayment(subscriptionId)
      : mock.gateway.cancelSubscription(subscriptionId);
  return { result: await deliver(mock, delivery) };
}

export interface StripeEventLine {
  eventId: string;
  type: string;
  at: string;
  result: WebhookResult;
}

/** EF-8 — the learner's webhook history (simulated mode keeps it in memory). */
export async function listStripeEvents(
  ctx: Pick<ServiceContext, 'userId'>,
  overrides: Partial<BillingDeps> = {},
): Promise<StripeEventLine[]> {
  const userId = requireUser(ctx);
  const { deps } = await mockContext(overrides);
  return (deps.journal?.list(userId) ?? []).map((entry: JournalEntry) => ({
    eventId: entry.eventId,
    type: entry.type,
    at: entry.at,
    result: entry.result,
  }));
}
