// Simulated Stripe (`STRIPE_MODE=mock`, SPEC-210 ET-2, EF-7, ADR-0215): an in-memory, deterministic
// gateway. Identifiers are numbered (`cus_mock_1`, `sub_mock_1`, `cs_mock_1`, `evt_mock_1`), the
// time comes from the injected clock, and webhooks are signed with the same scheme as Stripe's. It
// never reaches the network. Its state lives in a plain object so that every route bundle of the
// Next.js server can share it through `globalThis` (see `deps.ts`).
import { AppError, type Clock } from '@learny/core';

import { WEBHOOK_TOLERANCE_SECONDS } from './config';
import type {
  CreateCheckoutInput,
  CreateCustomerInput,
  CreatePortalInput,
  StripeGateway,
  StripeSubscriptionState,
} from './stripe-client';
import {
  normalizeStripeEvent,
  signPayload,
  verifySignature,
  type StripeEvent,
} from './stripe-event';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface MockCheckoutSession {
  id: string;
  customerId: string;
  userId: string;
  successPath: string;
  cancelPath: string;
  status: 'open' | 'complete' | 'canceled';
  subscriptionId: string | null;
}

interface MockSubscription {
  id: string;
  customerId: string;
  userId: string;
  status: string;
  currentPeriodEnd: Date;
}

export interface MockStripeState {
  customers: Map<string, { id: string; userId: string }>;
  customerKeys: Map<string, string>;
  sessions: Map<string, MockCheckoutSession>;
  sessionKeys: Map<string, string>;
  subscriptions: Map<string, MockSubscription>;
  counters: { customer: number; subscription: number; session: number; event: number };
}

export function createMockState(start = 0): MockStripeState {
  return {
    customers: new Map(),
    customerKeys: new Map(),
    sessions: new Map(),
    sessionKeys: new Map(),
    subscriptions: new Map(),
    counters: { customer: start, subscription: start, session: start, event: start },
  };
}

/** A signed webhook ready to be delivered to the webhook handler. */
export interface MockDelivery {
  eventId: string;
  type: string;
  created: number;
  payload: string;
  signature: string;
}

export interface MockEventOptions {
  /** Unix seconds; defaults to the clock (tests use it to craft out-of-order events). */
  created?: number;
  id?: string;
}

export interface MockStripeOptions {
  clock: Clock;
  webhookSecret: string;
  state?: MockStripeState;
}

export class MockStripeGateway implements StripeGateway {
  readonly mode = 'mock' as const;
  private readonly clock: Clock;
  private readonly webhookSecret: string;
  readonly state: MockStripeState;

  constructor(options: MockStripeOptions) {
    this.clock = options.clock;
    this.webhookSecret = options.webhookSecret;
    this.state = options.state ?? createMockState();
  }

  createCustomer(input: CreateCustomerInput): Promise<{ id: string }> {
    const known = this.state.customerKeys.get(input.idempotencyKey);
    if (known !== undefined) return Promise.resolve({ id: known });
    this.state.counters.customer += 1;
    const id = `cus_mock_${String(this.state.counters.customer)}`;
    this.state.customers.set(id, { id, userId: input.userId });
    this.state.customerKeys.set(input.idempotencyKey, id);
    return Promise.resolve({ id });
  }

  createCheckoutSession(input: CreateCheckoutInput): Promise<{ id: string; url: string }> {
    const known = this.state.sessionKeys.get(input.idempotencyKey);
    const existing = known === undefined ? undefined : this.state.sessions.get(known);
    if (existing !== undefined) {
      return Promise.resolve({ id: existing.id, url: mockCheckoutUrl(existing.id) });
    }
    this.state.counters.session += 1;
    const id = `cs_mock_${String(this.state.counters.session)}`;
    this.state.sessions.set(id, {
      id,
      customerId: input.customerId,
      userId: input.userId,
      successPath: input.successPath,
      cancelPath: input.cancelPath,
      status: 'open',
      subscriptionId: null,
    });
    this.state.sessionKeys.set(input.idempotencyKey, id);
    return Promise.resolve({ id, url: mockCheckoutUrl(id) });
  }

  createPortalSession(input: CreatePortalInput): Promise<{ url: string }> {
    return Promise.resolve({
      url: `/_dev/stripe/portal?return=${encodeURIComponent(input.returnPath)}`,
    });
  }

  retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionState> {
    const subscription = this.state.subscriptions.get(subscriptionId);
    if (subscription === undefined) {
      return Promise.reject(new AppError('NOT_FOUND', 'Ressource de paiement introuvable.'));
    }
    return Promise.resolve({
      id: subscription.id,
      customerId: subscription.customerId,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      userId: subscription.userId,
    });
  }

  constructEvent(payload: string, signature: string | null, now: Date): StripeEvent {
    verifySignature(payload, signature, this.webhookSecret, now, WEBHOOK_TOLERANCE_SECONDS);
    let raw: unknown;
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new AppError('INVALID_SIGNATURE', 'Événement Stripe illisible.');
    }
    return normalizeStripeEvent(raw);
  }

  // --- simulation helpers (dev pages and tests) -------------------------------------------------

  getCheckoutSession(sessionId: string): MockCheckoutSession | undefined {
    return this.state.sessions.get(sessionId);
  }

  /** Header for `payload` signed now (a retry of Stripe signs again with the current time). */
  sign(payload: string, at: Date = this.clock.now()): string {
    return signPayload(payload, this.webhookSecret, at);
  }

  /** Builds and signs an event of `type` carrying `object` (EF-7). */
  createEvent(
    type: string,
    object: Record<string, unknown>,
    options: MockEventOptions = {},
  ): MockDelivery {
    this.state.counters.event += 1;
    const id = options.id ?? `evt_mock_${String(this.state.counters.event)}`;
    const created = options.created ?? Math.floor(this.clock.now().getTime() / 1000);
    const payload = JSON.stringify({ id, type, created, data: { object } });
    return { eventId: id, type, created, payload, signature: this.sign(payload) };
  }

  /** The learner pays: the subscription becomes `active` for thirty days and the event is built. */
  completeCheckout(sessionId: string, options: MockEventOptions = {}): MockDelivery {
    const session = this.state.sessions.get(sessionId);
    if (session === undefined || session.status !== 'open') {
      throw new AppError('NOT_FOUND', 'Session de paiement introuvable ou déjà terminée.');
    }
    this.state.counters.subscription += 1;
    const subscriptionId = `sub_mock_${String(this.state.counters.subscription)}`;
    this.state.subscriptions.set(subscriptionId, {
      id: subscriptionId,
      customerId: session.customerId,
      userId: session.userId,
      status: 'active',
      currentPeriodEnd: new Date(this.clock.now().getTime() + THIRTY_DAYS_MS),
    });
    session.status = 'complete';
    session.subscriptionId = subscriptionId;
    return this.createEvent(
      'checkout.session.completed',
      {
        id: session.id,
        customer: session.customerId,
        subscription: subscriptionId,
        client_reference_id: session.userId,
        metadata: { userId: session.userId },
      },
      options,
    );
  }

  cancelCheckout(sessionId: string): MockCheckoutSession {
    const session = this.state.sessions.get(sessionId);
    if (session === undefined || session.status !== 'open') {
      throw new AppError('NOT_FOUND', 'Session de paiement introuvable ou déjà terminée.');
    }
    session.status = 'canceled';
    return session;
  }

  private subscription(subscriptionId: string): MockSubscription {
    const subscription = this.state.subscriptions.get(subscriptionId);
    if (subscription === undefined) {
      throw new AppError('NOT_FOUND', 'Ressource de paiement introuvable.');
    }
    return subscription;
  }

  private subscriptionObject(subscription: MockSubscription): Record<string, unknown> {
    return {
      id: subscription.id,
      customer: subscription.customerId,
      status: subscription.status,
      metadata: { userId: subscription.userId },
    };
  }

  /** A renewal payment fails: the subscription becomes `past_due`. */
  failPayment(subscriptionId: string, options: MockEventOptions = {}): MockDelivery {
    const subscription = this.subscription(subscriptionId);
    subscription.status = 'past_due';
    return this.createEvent(
      'invoice.payment_failed',
      {
        customer: subscription.customerId,
        subscription: subscription.id,
        subscription_details: { metadata: { userId: subscription.userId } },
      },
      options,
    );
  }

  /** The subscription ends (portal « Résilier »): `customer.subscription.deleted`. */
  cancelSubscription(subscriptionId: string, options: MockEventOptions = {}): MockDelivery {
    const subscription = this.subscription(subscriptionId);
    subscription.status = 'canceled';
    return this.createEvent(
      'customer.subscription.deleted',
      this.subscriptionObject(subscription),
      options,
    );
  }

  /** The subscription is renewed or changed: `customer.subscription.updated`. */
  renewSubscription(subscriptionId: string, options: MockEventOptions = {}): MockDelivery {
    const subscription = this.subscription(subscriptionId);
    subscription.status = 'active';
    subscription.currentPeriodEnd = new Date(this.clock.now().getTime() + THIRTY_DAYS_MS);
    return this.createEvent(
      'customer.subscription.updated',
      this.subscriptionObject(subscription),
      options,
    );
  }

  /** Test helper: puts a subscription in any Stripe status without building an event. */
  setSubscriptionState(subscriptionId: string, status: string, currentPeriodEnd?: Date): void {
    const subscription = this.subscription(subscriptionId);
    subscription.status = status;
    if (currentPeriodEnd !== undefined) subscription.currentPeriodEnd = currentPeriodEnd;
  }
}

export function mockCheckoutUrl(sessionId: string): string {
  return `/_dev/stripe/checkout?session=${sessionId}`;
}
