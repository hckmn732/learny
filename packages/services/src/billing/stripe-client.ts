// Stripe gateway (SPEC-210 ET-2): the interface the service depends on, and the implementation
// that talks to Stripe through the official SDK. The simulated implementation is `mock-stripe.ts`.
// The SDK is imported on the server only: no key ever reaches the browser (ET-6).
import Stripe from 'stripe';

import { AppError } from '@learny/core';

import { WEBHOOK_TOLERANCE_SECONDS, type BillingConfig } from './config';
import { normalizeStripeEvent, type StripeEvent } from './stripe-event';

/** Current state of a Stripe subscription (read again after every event, ADR-0215). */
export interface StripeSubscriptionState {
  id: string;
  customerId: string;
  /** Raw Stripe status: `active`, `trialing`, `past_due`… (mapped by `mapStripeStatus`). */
  status: string;
  currentPeriodEnd: Date;
  userId: string | null;
}

export interface CreateCustomerInput {
  userId: string;
  email: string | null;
  idempotencyKey: string;
}

export interface CreateCheckoutInput {
  customerId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
  /** Application paths, kept by the simulated gateway to send the learner back. */
  successPath: string;
  cancelPath: string;
  idempotencyKey: string;
}

export interface CreatePortalInput {
  customerId: string;
  returnUrl: string;
  returnPath: string;
}

export interface StripeGateway {
  readonly mode: 'mock' | 'test' | 'live';
  createCustomer(input: CreateCustomerInput): Promise<{ id: string }>;
  createCheckoutSession(input: CreateCheckoutInput): Promise<{ id: string; url: string }>;
  createPortalSession(input: CreatePortalInput): Promise<{ url: string }>;
  retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionState>;
  /** Verifies the signature of the raw body and returns the event (throws `INVALID_SIGNATURE`). */
  constructEvent(payload: string, signature: string | null, now: Date): StripeEvent;
}

const UNAVAILABLE = 'Le service de paiement est momentanément indisponible.';

/** Never forwards the SDK message (it may quote identifiers): a stable code and a French detail. */
export function translateStripeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === 'resource_missing'
  ) {
    return new AppError('NOT_FOUND', 'Ressource de paiement introuvable.');
  }
  return new AppError('SERVICE_UNAVAILABLE', UNAVAILABLE);
}

export class StripeSdkGateway implements StripeGateway {
  readonly mode: 'test' | 'live';
  private readonly stripe: Stripe;

  constructor(
    private readonly config: BillingConfig,
    client?: Stripe,
  ) {
    this.mode = config.mode === 'live' ? 'live' : 'test';
    this.stripe =
      client ??
      new Stripe(config.secretKey ?? '', {
        apiVersion: '2025-02-24.acacia',
        maxNetworkRetries: 1,
        timeout: 10_000,
        appInfo: { name: 'Learny' },
      });
  }

  private requirePriceId(): string {
    if (this.config.priceId === undefined) {
      throw new AppError('SERVICE_UNAVAILABLE', UNAVAILABLE);
    }
    return this.config.priceId;
  }

  async createCustomer(input: CreateCustomerInput): Promise<{ id: string }> {
    try {
      const customer = await this.stripe.customers.create(
        {
          ...(input.email === null ? {} : { email: input.email }),
          metadata: { userId: input.userId },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      return { id: customer.id };
    } catch (error) {
      throw translateStripeError(error);
    }
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<{ id: string; url: string }> {
    try {
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: input.customerId,
          client_reference_id: input.userId,
          line_items: [{ price: this.requirePriceId(), quantity: 1 }],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          locale: 'fr',
          metadata: { userId: input.userId },
          subscription_data: { metadata: { userId: input.userId } },
        },
        { idempotencyKey: input.idempotencyKey },
      );
      if (session.url === null) throw new AppError('SERVICE_UNAVAILABLE', UNAVAILABLE);
      return { id: session.id, url: session.url };
    } catch (error) {
      throw translateStripeError(error);
    }
  }

  async createPortalSession(input: CreatePortalInput): Promise<{ url: string }> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: input.customerId,
        return_url: input.returnUrl,
      });
      return { url: session.url };
    } catch (error) {
      throw translateStripeError(error);
    }
  }

  async retrieveSubscription(subscriptionId: string): Promise<StripeSubscriptionState> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const customer = subscription.customer;
      const userId = subscription.metadata.userId;
      return {
        id: subscription.id,
        customerId: typeof customer === 'string' ? customer : customer.id,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        userId: userId !== undefined && userId !== '' ? userId : null,
      };
    } catch (error) {
      throw translateStripeError(error);
    }
  }

  constructEvent(payload: string, signature: string | null, now: Date): StripeEvent {
    const secret = this.config.webhookSecret;
    if (secret === undefined) throw new AppError('SERVICE_UNAVAILABLE', UNAVAILABLE);
    if (signature === null || signature.trim() === '') {
      throw new AppError('INVALID_SIGNATURE', 'Signature du webhook absente.');
    }
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        secret,
        WEBHOOK_TOLERANCE_SECONDS,
        undefined,
        now.getTime(),
      );
      return normalizeStripeEvent(event);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('INVALID_SIGNATURE', 'Signature du webhook invalide.');
    }
  }
}
