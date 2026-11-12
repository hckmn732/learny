// Unit tests of the real Stripe gateway (SPEC-210 ET-2, CL-8): every SDK call is a fake, no key and
// no network. The error translation never forwards an SDK message.
import { randomBytes } from 'node:crypto';

import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';

import type { BillingConfig } from './config';
import { StripeSdkGateway, translateStripeError } from './stripe-client';

const NOW = new Date('2026-11-11T12:20:00Z');
const WEBHOOK_SECRET = `whsec_${randomBytes(24).toString('hex')}`;

const CONFIG: BillingConfig = {
  mode: 'test',
  secretKey: randomBytes(24).toString('hex'),
  webhookSecret: WEBHOOK_SECRET,
  priceId: 'price_fake',
  appUrl: 'https://learny.test',
};

function fakeClient() {
  return {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    subscriptions: { retrieve: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  };
}

function gateway(config: BillingConfig = CONFIG, client = fakeClient()) {
  return {
    client,
    stripe: new StripeSdkGateway(config, client as unknown as Stripe),
  };
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : undefined;
  }
  return undefined;
}

async function codeOfAsync(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
  } catch (error) {
    return error instanceof AppError ? error.code : undefined;
  }
  return undefined;
}

describe('[SPEC-210] passerelle Stripe réelle', () => {
  it('expose le mode configuré et ne construit un client qu’au besoin', () => {
    expect(gateway().stripe.mode).toBe('test');
    expect(gateway({ ...CONFIG, mode: 'live' }).stripe.mode).toBe('live');
    // Without an injected client the SDK is built from the key: no network call happens here.
    expect(() => new StripeSdkGateway(CONFIG)).not.toThrow();
  });

  it('crée le client Stripe avec la clé d’idempotence et l’identifiant du compte', async () => {
    const { client, stripe } = gateway();
    client.customers.create.mockResolvedValue({ id: 'cus_1' });
    await expect(
      stripe.createCustomer({ userId: 'u1', email: 'a@b.test', idempotencyKey: 'customer:u1' }),
    ).resolves.toEqual({ id: 'cus_1' });
    expect(client.customers.create).toHaveBeenCalledWith(
      { email: 'a@b.test', metadata: { userId: 'u1' } },
      { idempotencyKey: 'customer:u1' },
    );
    client.customers.create.mockResolvedValue({ id: 'cus_2' });
    await stripe.createCustomer({ userId: 'u2', email: null, idempotencyKey: 'customer:u2' });
    expect(client.customers.create).toHaveBeenLastCalledWith(
      { metadata: { userId: 'u2' } },
      { idempotencyKey: 'customer:u2' },
    );
  });

  it('refuse un prix absent et une session sans URL, et traduit les pannes Stripe', async () => {
    const missingPrice = gateway({ ...CONFIG, priceId: undefined });
    await expect(
      codeOfAsync(() =>
        missingPrice.stripe.createCheckoutSession({
          customerId: 'cus_1',
          userId: 'u1',
          successUrl: 'https://learny.test/ok',
          cancelUrl: 'https://learny.test/no',
          successPath: '/ok',
          cancelPath: '/no',
          idempotencyKey: 'k',
        }),
      ),
    ).resolves.toBe('SERVICE_UNAVAILABLE');

    const { client, stripe } = gateway();
    client.checkout.sessions.create.mockResolvedValue({ id: 'cs_1', url: null });
    await expect(
      codeOfAsync(() =>
        stripe.createCheckoutSession({
          customerId: 'cus_1',
          userId: 'u1',
          successUrl: 'https://learny.test/ok',
          cancelUrl: 'https://learny.test/no',
          successPath: '/ok',
          cancelPath: '/no',
          idempotencyKey: 'k',
        }),
      ),
    ).resolves.toBe('SERVICE_UNAVAILABLE');

    const missing = Object.create(Stripe.errors.StripeInvalidRequestError.prototype) as {
      code: string;
    };
    missing.code = 'resource_missing';
    expect(translateStripeError(missing).code).toBe('NOT_FOUND');
    const original = new AppError('CONFLICT', 'déjà là');
    expect(translateStripeError(original)).toBe(original);
    expect(translateStripeError(new Error('réseau')).code).toBe('SERVICE_UNAVAILABLE');
    expect(translateStripeError(new Error('réseau')).message).not.toContain('réseau');
  });

  it('ouvre une session de paiement au prix configuré et une session de portail', async () => {
    const { client, stripe } = gateway();
    client.checkout.sessions.create.mockResolvedValue({
      id: 'cs_1',
      url: 'https://checkout.stripe.test/cs_1',
    });
    await expect(
      stripe.createCheckoutSession({
        customerId: 'cus_1',
        userId: 'u1',
        successUrl: 'https://learny.test/ok',
        cancelUrl: 'https://learny.test/no',
        successPath: '/ok',
        cancelPath: '/no',
        idempotencyKey: 'checkout:u1:k',
      }),
    ).resolves.toEqual({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' });
    expect(client.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_1',
        client_reference_id: 'u1',
        line_items: [{ price: 'price_fake', quantity: 1 }],
        locale: 'fr',
        subscription_data: { metadata: { userId: 'u1' } },
      }),
      { idempotencyKey: 'checkout:u1:k' },
    );

    client.billingPortal.sessions.create.mockResolvedValue({ url: 'https://portal.test' });
    await expect(
      stripe.createPortalSession({
        customerId: 'cus_1',
        returnUrl: 'https://learny.test/parametres',
        returnPath: '/parametres#ia',
      }),
    ).resolves.toEqual({ url: 'https://portal.test' });
    expect(client.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://learny.test/parametres',
    });

    client.billingPortal.sessions.create.mockRejectedValue(new Error('boom'));
    await expect(
      codeOfAsync(() =>
        stripe.createPortalSession({
          customerId: 'cus_1',
          returnUrl: 'https://learny.test/parametres',
          returnPath: '/parametres#ia',
        }),
      ),
    ).resolves.toBe('SERVICE_UNAVAILABLE');
    client.customers.create.mockRejectedValue(new Error('boom'));
    await expect(
      codeOfAsync(() => stripe.createCustomer({ userId: 'u1', email: null, idempotencyKey: 'k' })),
    ).resolves.toBe('SERVICE_UNAVAILABLE');
    client.checkout.sessions.create.mockRejectedValue(new Error('boom'));
    await expect(
      codeOfAsync(() =>
        stripe.createCheckoutSession({
          customerId: 'cus_1',
          userId: 'u1',
          successUrl: 'https://learny.test/ok',
          cancelUrl: 'https://learny.test/no',
          successPath: '/ok',
          cancelPath: '/no',
          idempotencyKey: 'k',
        }),
      ),
    ).resolves.toBe('SERVICE_UNAVAILABLE');
  });

  it('relit l’état d’un abonnement, client développé ou identifiant seul', async () => {
    const { client, stripe } = gateway();
    client.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_1',
      customer: 'cus_1',
      status: 'active',
      current_period_end: 1_800_000_000,
      metadata: { userId: 'u1' },
    });
    await expect(stripe.retrieveSubscription('sub_1')).resolves.toEqual({
      id: 'sub_1',
      customerId: 'cus_1',
      status: 'active',
      currentPeriodEnd: new Date(1_800_000_000 * 1000),
      userId: 'u1',
    });
    client.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_2',
      customer: { id: 'cus_2' },
      status: 'past_due',
      current_period_end: 1_800_000_000,
      metadata: {},
    });
    await expect(stripe.retrieveSubscription('sub_2')).resolves.toMatchObject({
      customerId: 'cus_2',
      userId: null,
    });
    client.subscriptions.retrieve.mockRejectedValue(new Error('boom'));
    await expect(codeOfAsync(() => stripe.retrieveSubscription('sub_1'))).resolves.toBe(
      'SERVICE_UNAVAILABLE',
    );
  });

  it('vérifie la signature avec le SDK et normalise l’événement (CL-3)', () => {
    const { client, stripe } = gateway();
    const raw = {
      id: 'evt_1',
      type: 'customer.subscription.updated',
      created: 1_700_000_000,
      data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { userId: 'u1' } } },
    };
    client.webhooks.constructEvent.mockReturnValue(raw);
    expect(stripe.constructEvent('{}', 't=1,v1=abc', new Date('2026-11-11T12:20:00Z'))).toEqual({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      created: 1_700_000_000,
      userId: 'u1',
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
    });
    expect(client.webhooks.constructEvent).toHaveBeenCalledWith(
      '{}',
      't=1,v1=abc',
      WEBHOOK_SECRET,
      300,
      undefined,
      NOW.getTime(),
    );

    expect(
      codeOf(() =>
        gateway({ ...CONFIG, webhookSecret: undefined }).stripe.constructEvent('{}', 'x', NOW),
      ),
    ).toBe('SERVICE_UNAVAILABLE');
    expect(codeOf(() => stripe.constructEvent('{}', '  ', NOW))).toBe('INVALID_SIGNATURE');
    expect(codeOf(() => stripe.constructEvent('{}', null, NOW))).toBe('INVALID_SIGNATURE');

    client.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('mauvais secret');
    });
    expect(codeOf(() => stripe.constructEvent('{}', 't=1,v1=abc', NOW))).toBe('INVALID_SIGNATURE');
    client.webhooks.constructEvent.mockImplementation(() => {
      throw new AppError('INVALID_SIGNATURE', 'déjà');
    });
    expect(codeOf(() => stripe.constructEvent('{}', 't=1,v1=abc', NOW))).toBe('INVALID_SIGNATURE');
  });
});
