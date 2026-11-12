// Unit tests of the simulated Stripe gateway (SPEC-210 ET-2, EF-7). In memory, deterministic clock:
// customers, checkout sessions, subscriptions, signed webhooks and their ordering.
import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { TestClock } from '../../test/support/fakes';

import { WEBHOOK_TOLERANCE_SECONDS } from './config';
import { MockStripeGateway, createMockState, isMockGateway, mockCheckoutUrl } from './mock-stripe';

const clock = new TestClock();
const SECRET = `whsec_${randomBytes(24).toString('hex')}`;
const USER = '11111111-1111-4111-8111-111111111111';

function gateway(state = createMockState()) {
  return { state, stripe: new MockStripeGateway({ clock, webhookSecret: SECRET, state }) };
}

function codeOf(error: unknown): string | undefined {
  return error instanceof AppError ? error.code : undefined;
}

describe('[SPEC-210] passerelle Stripe simulée', () => {
  it('numérote les clients et respecte la clé d’idempotence (CL-6)', async () => {
    const { stripe } = gateway();
    const input = { userId: USER, email: null, idempotencyKey: 'customer:one' };
    await expect(stripe.createCustomer(input)).resolves.toEqual({ id: 'cus_mock_1' });
    await expect(stripe.createCustomer(input)).resolves.toEqual({ id: 'cus_mock_1' });
    await expect(
      stripe.createCustomer({ ...input, idempotencyKey: 'customer:two' }),
    ).resolves.toEqual({ id: 'cus_mock_2' });
    expect(stripe.state.customers.get('cus_mock_1')).toEqual({ id: 'cus_mock_1', userId: USER });
  });

  it('ouvre une session de paiement, la rejoue et la retrouve (EF-7)', async () => {
    const { stripe } = gateway();
    const input = {
      customerId: 'cus_mock_1',
      userId: USER,
      successUrl: 'https://learny.test/ok',
      cancelUrl: 'https://learny.test/no',
      successPath: '/parametres?ok=1',
      cancelPath: '/parametres?no=1',
      idempotencyKey: 'checkout:one',
    };
    await expect(stripe.createCheckoutSession(input)).resolves.toEqual({
      id: 'cs_mock_1',
      url: mockCheckoutUrl('cs_mock_1'),
    });
    await expect(stripe.createCheckoutSession(input)).resolves.toEqual({
      id: 'cs_mock_1',
      url: mockCheckoutUrl('cs_mock_1'),
    });
    expect(stripe.getCheckoutSession('cs_mock_1')).toEqual({
      id: 'cs_mock_1',
      customerId: 'cus_mock_1',
      userId: USER,
      successPath: '/parametres?ok=1',
      cancelPath: '/parametres?no=1',
      status: 'open',
      subscriptionId: null,
    });
    expect(stripe.getCheckoutSession('cs_unknown')).toBeUndefined();
    await expect(
      stripe.createPortalSession({
        customerId: 'cus_mock_1',
        returnUrl: 'https://learny.test/parametres',
        returnPath: '/parametres#ia',
      }),
    ).resolves.toEqual({ url: '/_dev/stripe/portal?return=%2Fparametres%23ia' });
  });

  it('paiement : abonnement actif trente jours et événement signé (EF-4, EF-7)', async () => {
    const { stripe } = gateway();
    await stripe.createCustomer({ userId: USER, email: null, idempotencyKey: 'c' });
    const { id } = await stripe.createCheckoutSession({
      customerId: 'cus_mock_1',
      userId: USER,
      successUrl: 'https://learny.test/ok',
      cancelUrl: 'https://learny.test/no',
      successPath: '/ok',
      cancelPath: '/no',
      idempotencyKey: 's',
    });
    const delivery = stripe.completeCheckout(id);
    expect(delivery).toMatchObject({
      eventId: 'evt_mock_1',
      type: 'checkout.session.completed',
      created: Math.floor(clock.now().getTime() / 1000),
    });
    expect(stripe.getCheckoutSession(id)).toMatchObject({
      status: 'complete',
      subscriptionId: 'sub_mock_1',
    });
    await expect(stripe.retrieveSubscription('sub_mock_1')).resolves.toEqual({
      id: 'sub_mock_1',
      customerId: 'cus_mock_1',
      userId: USER,
      status: 'active',
      currentPeriodEnd: new Date(clock.now().getTime() + 30 * 24 * 3600 * 1000),
    });
    // A completed session cannot be paid or cancelled twice.
    expect(codeOf(safe(() => stripe.completeCheckout(id)))).toBe('NOT_FOUND');
    expect(codeOf(safe(() => stripe.cancelCheckout(id)))).toBe('NOT_FOUND');
    await expect(stripe.retrieveSubscription('sub_unknown')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('annule une session ouverte sans créer d’abonnement', async () => {
    const { stripe } = gateway();
    const { id } = await stripe.createCheckoutSession({
      customerId: 'cus_mock_1',
      userId: USER,
      successUrl: 'https://learny.test/ok',
      cancelUrl: 'https://learny.test/no',
      successPath: '/ok',
      cancelPath: '/no',
      idempotencyKey: 's',
    });
    expect(stripe.cancelCheckout(id)).toMatchObject({ status: 'canceled' });
    expect(stripe.state.subscriptions.size).toBe(0);
  });

  it('construit les événements de la démonstration dans l’ordre du protocole (EF-8)', async () => {
    const { stripe } = gateway();
    await stripe.createCustomer({ userId: USER, email: null, idempotencyKey: 'c' });
    const { id } = await stripe.createCheckoutSession({
      customerId: 'cus_mock_1',
      userId: USER,
      successUrl: 'https://learny.test/ok',
      cancelUrl: 'https://learny.test/no',
      successPath: '/ok',
      cancelPath: '/no',
      idempotencyKey: 's',
    });
    stripe.completeCheckout(id);
    const failed = stripe.failPayment('sub_mock_1');
    expect(failed).toMatchObject({ eventId: 'evt_mock_2', type: 'invoice.payment_failed' });
    expect(stripe.state.subscriptions.get('sub_mock_1')?.status).toBe('past_due');
    const updated = stripe.renewSubscription('sub_mock_1');
    expect(updated).toMatchObject({ type: 'customer.subscription.updated' });
    const deleted = stripe.cancelSubscription('sub_mock_1');
    expect(deleted).toMatchObject({ type: 'customer.subscription.deleted' });
    expect(stripe.state.subscriptions.get('sub_mock_1')?.status).toBe('canceled');
    stripe.setSubscriptionState('sub_mock_1', 'trialing', new Date('2027-01-01T00:00:00Z'));
    expect(stripe.state.subscriptions.get('sub_mock_1')).toMatchObject({
      status: 'trialing',
      currentPeriodEnd: new Date('2027-01-01T00:00:00Z'),
    });
    expect(codeOf(safe(() => stripe.failPayment('sub_unknown')))).toBe('NOT_FOUND');
    expect(codeOf(safe(() => stripe.cancelSubscription('sub_unknown')))).toBe('NOT_FOUND');
    expect(codeOf(safe(() => stripe.renewSubscription('sub_unknown')))).toBe('NOT_FOUND');
    expect(
      codeOf(
        safe(() => {
          stripe.setSubscriptionState('sub_unknown', 'active');
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('crée des événements à la demande avec identifiant et date imposés', () => {
    const { stripe } = gateway();
    const delivery = stripe.createEvent(
      'customer.subscription.updated',
      { id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { userId: USER } },
      { id: 'evt_fixed', created: 1_700_000_000 },
    );
    expect(delivery).toMatchObject({ eventId: 'evt_fixed', created: 1_700_000_000 });
    expect(stripe.state.counters.event).toBe(1);
  });

  it('vérifie la signature des webhooks et refuse un corps illisible (CL-3)', () => {
    const { stripe } = gateway();
    const delivery = stripe.createEvent('customer.subscription.updated', { id: 'sub_1' });
    expect(() =>
      stripe.constructEvent(delivery.payload, delivery.signature, clock.now()),
    ).not.toThrow();
    expect(codeOf(safe(() => stripe.constructEvent(delivery.payload, null, clock.now())))).toBe(
      'INVALID_SIGNATURE',
    );
    expect(
      codeOf(safe(() => stripe.constructEvent('{pas du json', delivery.signature, clock.now()))),
    ).toBe('INVALID_SIGNATURE');
    clock.advance((WEBHOOK_TOLERANCE_SECONDS + 5) * 1000);
    expect(
      codeOf(safe(() => stripe.constructEvent(delivery.payload, delivery.signature, clock.now()))),
    ).toBe('INVALID_SIGNATURE');
    clock.advance(-(WEBHOOK_TOLERANCE_SECONDS + 5) * 1000);
  });

  it('reconnaît une passerelle simulée sans `instanceof` (déploiement par bundles)', () => {
    const { stripe, state } = gateway();
    expect(isMockGateway(stripe)).toBe(true);
    expect(isMockGateway({ mode: 'test' } as never)).toBe(false);
    expect(createMockState(10).counters).toEqual({
      customer: 10,
      subscription: 10,
      session: 10,
      event: 10,
    });
    expect(state.counters.customer).toBe(0);
  });
});

function safe(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}
