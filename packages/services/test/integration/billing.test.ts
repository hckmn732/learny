// Integration tests of the subscription service (SPEC-210 §12, CA-1 to CA-5).
//
// Postgres is real (RLS, constraints, the `enqueue_event` function, row locks); Stripe is the
// simulated gateway of `STRIPE_MODE=mock`, signed like the real one. Users are committed (the
// concurrency tests need several connections) and removed after each test. The test with real
// Stripe test keys only runs when they are present; otherwise it is skipped with its reason.
import { randomBytes, randomUUID } from 'node:crypto';

import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { afterAll } from 'vitest';

import { AppError, type Clock } from '@learny/core';
import { createLogCapture, createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';

import {
  MockStripeGateway,
  StripeSdkGateway,
  WebhookJournal,
  getSubscription,
  handleWebhook,
  hasManagedAi,
  mapStripeStatus,
  openPortal,
  resolveBillingConfig,
  startCheckout,
  type BillingDeps,
  type MockDelivery,
} from '../../src/billing/index';

const PREFIX = 'sdd-210-';
const DAY_MS = 24 * 60 * 60 * 1000;

class TestClock implements Clock {
  private current = new Date('2026-11-11T12:20:00Z');
  now(): Date {
    return new Date(this.current);
  }
  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

const SUCCESS = { successPath: '/_dev/sdd/SPEC-210', cancelPath: '/_dev/sdd/SPEC-210' };

interface Harness {
  clock: TestClock;
  gateway: MockStripeGateway;
  deps: Partial<BillingDeps>;
  logs: ReturnType<typeof createLogCapture>;
  webhookKey: string;
}

function harness(): Harness {
  const clock = new TestClock();
  const webhookKey = `whsec_${randomBytes(24).toString('hex')}`;
  const gateway = new MockStripeGateway({ clock, webhookSecret: webhookKey });
  const logs = createLogCapture();
  const deps: Partial<BillingDeps> = {
    db: serviceDb(),
    gateway,
    clock,
    logger: createLogger({ destination: logs.destination, level: 'debug' }),
    config: resolveBillingConfig({
      STRIPE_MODE: 'mock',
      APP_ENV: 'test',
      NEXT_PUBLIC_APP_URL: 'https://learny.test',
    }),
    journal: new WebhookJournal(),
  };
  return { clock, gateway, deps, logs, webhookKey };
}

async function createUser(label: string): Promise<string> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => (await createTestUser(tx, { email })).id);
}

async function cleanup(): Promise<void> {
  const db = serviceDb();
  await db.execute(sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`);
  await db.execute(sql`delete from public.stripe_events where event_id like 'evt_%'`);
}

async function row(userId: string) {
  const rows = await serviceDb().execute<{
    status: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    current_period_end: Date | null;
    stripe_event_at: Date | null;
  }>(sql`select * from public.subscriptions where user_id = ${userId}::uuid`);
  return rows[0];
}

async function outboxNames(userId: string): Promise<string[]> {
  const rows = await serviceDb().execute<{ name: string }>(
    sql`select name from public.event_outbox where user_id = ${userId}::uuid order by created_at, name`,
  );
  return rows.map((entry) => entry.name);
}

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('une erreur était attendue');
}

function receive(delivery: MockDelivery, h: Harness, signature?: string | null) {
  return handleWebhook(
    {
      payload: delivery.payload,
      signature: signature === undefined ? delivery.signature : signature,
    },
    h.deps,
  );
}

beforeEach(cleanup);
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("[SPEC-210] service d'abonnement", () => {
  it('CA-1 — Checkout simulé : client créé, paiement, webhook signé → actif puis résilié', async () => {
    const h = harness();
    const userId = await createUser('cycle');

    expect(await getSubscription({ userId, clock: h.clock }, h.deps)).toEqual({
      status: 'none',
      currentPeriodEnd: null,
      hasManagedAi: false,
      dailyCapUsd: 1.5,
    });

    const checkout = await startCheckout({ userId }, SUCCESS, {}, h.deps);
    expect(checkout.url).toBe('/_dev/stripe/checkout?session=cs_mock_1');
    expect((await row(userId))?.stripe_customer_id).toBe('cus_mock_1');
    expect(h.gateway.state.counters.customer).toBe(1);

    const paid = await receive(h.gateway.completeCheckout('cs_mock_1'), h);
    expect(paid.result).toBe('applied');
    const active = await getSubscription({ userId, clock: h.clock }, h.deps);
    expect(active.status).toBe('active');
    expect(active.hasManagedAi).toBe(true);
    expect(active.currentPeriodEnd).toBe(
      new Date(h.clock.now().getTime() + 30 * DAY_MS).toISOString(),
    );
    expect(await hasManagedAi(userId, { clock: h.clock })).toBe(true);
    expect((await row(userId))?.stripe_subscription_id).toBe('sub_mock_1');

    const already = await errorOf(startCheckout({ userId }, SUCCESS, {}, h.deps));
    expect(already.code).toBe('ALREADY_SUBSCRIBED');

    const ended = await receive(h.gateway.cancelSubscription('sub_mock_1'), h);
    expect(ended.result).toBe('applied');
    const canceled = await getSubscription({ userId, clock: h.clock }, h.deps);
    expect(canceled.status).toBe('canceled');
    expect(canceled.hasManagedAi).toBe(false);

    // ET-5 — one `billing/subscription-changed` per change of status.
    expect(await outboxNames(userId)).toEqual([
      'billing/subscription-changed',
      'billing/subscription-changed',
    ]);
    // A canceled learner can subscribe again.
    expect((await startCheckout({ userId }, SUCCESS, {}, h.deps)).url).toContain('cs_mock_');
  });

  it('CA-2, CL-3 — signature invalide, altérée, absente ou expirée : INVALID_SIGNATURE, rien écrit', async () => {
    const h = harness();
    const userId = await createUser('signature');
    await startCheckout({ userId }, SUCCESS, {}, h.deps);
    const delivery = h.gateway.completeCheckout('cs_mock_1');

    const wrongKey = h.gateway.sign(delivery.payload);
    const forged = new MockStripeGateway({
      clock: h.clock,
      webhookSecret: `whsec_${randomBytes(24).toString('hex')}`,
    });
    const attempts: (string | null)[] = [
      null,
      'garbage',
      forged.sign(delivery.payload),
      // Valid signature, but dated more than 300 seconds ago.
      h.gateway.sign(delivery.payload, new Date(h.clock.now().getTime() - 301_000)),
    ];
    for (const signature of attempts) {
      const error = await errorOf(receive(delivery, h, signature));
      expect(error.code, String(signature)).toBe('INVALID_SIGNATURE');
    }
    const tampered = await errorOf(
      handleWebhook({ payload: `${delivery.payload} `, signature: wrongKey }, h.deps),
    );
    expect(tampered.code).toBe('INVALID_SIGNATURE');

    const events = await serviceDb().execute<{ n: number }>(
      sql`select count(*)::int as n from public.stripe_events`,
    );
    expect(events[0]?.n).toBe(0);
    expect((await row(userId))?.status).toBe('none');
    // A fresh signature on the same body is accepted.
    expect((await receive(delivery, h, h.gateway.sign(delivery.payload))).result).toBe('applied');
  });

  it('CL-1 — le même webhook livré deux fois n’est traité qu’une fois', async () => {
    const h = harness();
    const userId = await createUser('doublon');
    await startCheckout({ userId }, SUCCESS, {}, h.deps);
    const delivery = h.gateway.completeCheckout('cs_mock_1');

    expect((await receive(delivery, h)).result).toBe('applied');
    expect((await receive(delivery, h, h.gateway.sign(delivery.payload))).result).toBe('duplicate');
    expect((await receive(delivery, h)).result).toBe('duplicate');

    const events = await serviceDb().execute<{ n: number; processed: number }>(
      sql`select count(*)::int as n, count(processed_at)::int as processed from public.stripe_events`,
    );
    expect(events[0]).toEqual({ n: 1, processed: 1 });
    expect(await outboxNames(userId)).toEqual(['billing/subscription-changed']);
    expect(h.deps.journal?.list(userId).map((entry) => entry.result)).toEqual([
      'applied',
      'duplicate',
      'duplicate',
    ]);
  });

  it('CL-2 — un événement plus ancien que le dernier appliqué est ignoré', async () => {
    const h = harness();
    const userId = await createUser('ordre');
    await startCheckout({ userId }, SUCCESS, {}, h.deps);
    const now = Math.floor(h.clock.now().getTime() / 1000);
    await receive(h.gateway.completeCheckout('cs_mock_1', { created: now }), h);

    // The cancellation (newer) arrives first, then an older « updated (active) ».
    expect(
      (await receive(h.gateway.cancelSubscription('sub_mock_1', { created: now + 10 }), h)).result,
    ).toBe('applied');
    const older = h.gateway.renewSubscription('sub_mock_1', { created: now + 5 });
    expect((await receive(older, h)).result).toBe('stale');

    const state = await row(userId);
    expect(state?.status).toBe('canceled');
    expect(new Date(String(state?.stripe_event_at)).getTime()).toBe((now + 10) * 1000);
    expect(await hasManagedAi(userId, { clock: h.clock })).toBe(false);
    // Same second: applied (the comparison is strict).
    h.gateway.setSubscriptionState(
      'sub_mock_1',
      'active',
      new Date(h.clock.now().getTime() + 30 * DAY_MS),
    );
    const sameSecond = h.gateway.renewSubscription('sub_mock_1', { created: now + 10 });
    expect((await receive(sameSecond, h)).result).toBe('applied');
    expect((await row(userId))?.status).toBe('active');
  });

  it('CL-9 — client inconnu : 200, événement consigné, aucun utilisateur créé', async () => {
    const h = harness();
    const before = await serviceDb().execute<{ n: number }>(
      sql`select count(*)::int as n from auth.users`,
    );
    const stranger = h.gateway.createEvent('customer.subscription.updated', {
      id: 'sub_mock_77',
      customer: 'cus_inconnu_0042',
      status: 'active',
      metadata: {},
    });
    const outcome = await receive(stranger, h);
    expect(outcome.result).toBe('unknown_customer');
    const events = await serviceDb().execute<{ processed_at: Date | null }>(
      sql`select processed_at from public.stripe_events where event_id = ${stranger.eventId}`,
    );
    expect(events[0]?.processed_at).not.toBeNull();
    const after = await serviceDb().execute<{ n: number }>(
      sql`select count(*)::int as n from auth.users`,
    );
    expect(after[0]?.n).toBe(before[0]?.n);
    const logged = h.logs.records().filter((record) => record.level === 'error');
    expect(logged.length).toBeGreaterThan(0);
    expect(h.logs.text()).not.toContain('cus_inconnu_0042');
  });

  it('les types non traités sont acquittés sans effet', async () => {
    const h = harness();
    const ignored = h.gateway.createEvent('customer.created', { id: 'cus_mock_9' });
    expect((await receive(ignored, h)).result).toBe('ignored');
    const events = await serviceDb().execute<{ n: number }>(
      sql`select count(*)::int as n from public.stripe_events`,
    );
    expect(events[0]?.n).toBe(0);
  });

  it('CL-7, CA-3 — échec de paiement : past_due, plus de droit, événement de notification', async () => {
    const h = harness();
    const userId = await createUser('retard');
    await startCheckout({ userId }, SUCCESS, {}, h.deps);
    await receive(h.gateway.completeCheckout('cs_mock_1'), h);
    expect(await hasManagedAi(userId, { clock: h.clock })).toBe(true);

    h.clock.advance(1000);
    expect((await receive(h.gateway.failPayment('sub_mock_1'), h)).result).toBe('applied');
    expect((await row(userId))?.status).toBe('past_due');
    expect(await hasManagedAi(userId, { clock: h.clock })).toBe(false);
    expect((await outboxNames(userId)).sort()).toEqual([
      'billing/payment-failed',
      'billing/subscription-changed',
      'billing/subscription-changed',
    ]);
  });

  it('CL-4 — période échue sans webhook : hasManagedAi est faux bien que le statut soit active', async () => {
    const h = harness();
    const userId = await createUser('echue');
    await startCheckout({ userId }, SUCCESS, {}, h.deps);
    await receive(h.gateway.completeCheckout('cs_mock_1'), h);
    expect(await hasManagedAi(userId, { clock: h.clock })).toBe(true);

    h.clock.advance(31 * DAY_MS);
    expect((await row(userId))?.status).toBe('active');
    expect(await hasManagedAi(userId, { clock: h.clock })).toBe(false);
    expect((await getSubscription({ userId, clock: h.clock }, h.deps)).hasManagedAi).toBe(false);
  });

  it('CA-3 — hasManagedAi lit la base à chaque appel et refuse chaque statut sans droit', async () => {
    const h = harness();
    const userId = await createUser('statuts');
    const db = serviceDb();
    await db.execute(sql`insert into public.subscriptions (user_id) values (${userId}::uuid)`);
    expect(await hasManagedAi(userId, { clock: h.clock })).toBe(false);
    const future = new Date(h.clock.now().getTime() + DAY_MS).toISOString();
    for (const status of ['none', 'past_due', 'incomplete', 'canceled']) {
      await db.execute(
        sql`update public.subscriptions set status = ${status}::subscription_status, current_period_end = ${future}::timestamptz where user_id = ${userId}::uuid`,
      );
      expect(await hasManagedAi(userId, { clock: h.clock }), status).toBe(false);
    }
    await db.execute(
      sql`update public.subscriptions set status = 'active' where user_id = ${userId}::uuid`,
    );
    expect(await hasManagedAi(userId, { clock: h.clock })).toBe(true);
    expect(await hasManagedAi(randomUUID(), { clock: h.clock })).toBe(false);
  });

  it('CA-4, CL-5 — chemins externes refusés par le service, rien n’est créé', async () => {
    const h = harness();
    const userId = await createUser('chemin');
    for (const path of ['https://evil.example/x', '//evil.example', '/\\evil.example', 'x']) {
      const error = await errorOf(
        startCheckout({ userId }, { successPath: path, cancelPath: '/ko' }, {}, h.deps),
      );
      expect(error.code, path).toBe('VALIDATION_FAILED');
    }
    expect(await row(userId)).toBeUndefined();
    expect(h.gateway.state.counters.customer).toBe(0);
  });

  it('CL-6 — deux checkouts simultanés : un seul client Stripe, même URL pour la même clé', async () => {
    const h = harness();
    const userId = await createUser('concurrent');
    const [first, second] = await Promise.all([
      startCheckout({ userId }, SUCCESS, { idempotencyKey: 'cle-a' }, h.deps),
      startCheckout({ userId }, SUCCESS, { idempotencyKey: 'cle-b' }, h.deps),
    ]);
    expect(h.gateway.state.counters.customer).toBe(1);
    expect(h.gateway.state.customers.size).toBe(1);
    expect(first.url).not.toBe(second.url);

    // The same key replays the same session.
    const [again, twice] = await Promise.all([
      startCheckout({ userId }, SUCCESS, { idempotencyKey: 'cle-a' }, h.deps),
      startCheckout({ userId }, SUCCESS, { idempotencyKey: 'cle-a' }, h.deps),
    ]);
    expect(again.url).toBe(first.url);
    expect(twice.url).toBe(first.url);
    expect((await row(userId))?.stripe_customer_id).toBe('cus_mock_1');
  });

  it('CL-8 — Stripe indisponible : 503 et aucune ligne partielle', async () => {
    const h = harness();
    const userId = await createUser('panne');
    const broken: Partial<BillingDeps> = {
      ...h.deps,
      gateway: Object.assign(Object.create(h.gateway) as MockStripeGateway, {
        createCustomer: () =>
          Promise.reject(new AppError('SERVICE_UNAVAILABLE', 'Stripe est indisponible.')),
      }),
    };
    const error = await errorOf(startCheckout({ userId }, SUCCESS, {}, broken));
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
    expect(await row(userId)).toBeUndefined();
    // The service recovers once Stripe is back.
    expect((await startCheckout({ userId }, SUCCESS, {}, h.deps)).url).toContain('cs_mock_');
  });

  it('une panne de Stripe pendant la relecture annule la prise en compte (Stripe relivrera)', async () => {
    const h = harness();
    const userId = await createUser('relecture');
    await startCheckout({ userId }, SUCCESS, {}, h.deps);
    const delivery = h.gateway.completeCheckout('cs_mock_1');
    const failing: Partial<BillingDeps> = {
      ...h.deps,
      gateway: Object.assign(Object.create(h.gateway) as MockStripeGateway, {
        retrieveSubscription: () =>
          Promise.reject(new AppError('SERVICE_UNAVAILABLE', 'Stripe est indisponible.')),
      }),
    };
    const error = await errorOf(
      handleWebhook({ payload: delivery.payload, signature: delivery.signature }, failing),
    );
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
    const events = await serviceDb().execute<{ n: number }>(
      sql`select count(*)::int as n from public.stripe_events`,
    );
    expect(events[0]?.n).toBe(0);
    expect((await receive(delivery, h)).result).toBe('applied');
  });

  it('EF-2 — portail : introuvable sans client Stripe, puis URL de retour /parametres#ia', async () => {
    const h = harness();
    const userId = await createUser('portail');
    expect((await errorOf(openPortal({ userId }, h.deps))).code).toBe('NOT_FOUND');
    await startCheckout({ userId }, SUCCESS, {}, h.deps);
    const portal = await openPortal({ userId }, h.deps);
    expect(portal.url).toBe(`/_dev/stripe/portal?return=${encodeURIComponent('/parametres#ia')}`);
  });

  it('EF-5 — les statuts relus chez Stripe sont convertis (trialing, unpaid, incomplete_expired)', async () => {
    const h = harness();
    const userId = await createUser('conversion');
    await startCheckout({ userId }, SUCCESS, {}, h.deps);
    await receive(h.gateway.completeCheckout('cs_mock_1'), h);
    const expected: Record<string, string> = {
      trialing: 'active',
      unpaid: 'past_due',
      incomplete_expired: 'canceled',
      incomplete: 'incomplete',
    };
    for (const [stripeStatus, status] of Object.entries(expected)) {
      h.clock.advance(2000);
      h.gateway.setSubscriptionState(
        'sub_mock_1',
        stripeStatus,
        new Date(h.clock.now().getTime() + DAY_MS),
      );
      const delivery = h.gateway.createEvent('customer.subscription.updated', {
        id: 'sub_mock_1',
        customer: 'cus_mock_1',
        metadata: { userId },
      });
      await receive(delivery, h);
      expect((await row(userId))?.status, stripeStatus).toBe(status);
      expect(mapStripeStatus(stripeStatus)).toBe(status);
    }
  });

  it('CA-5 — ni clé, ni identifiant complet dans les journaux, les réponses ni la base lisible', async () => {
    const h = harness();
    const userId = await createUser('secrets');
    const outputs: unknown[] = [];
    outputs.push(await startCheckout({ userId }, SUCCESS, {}, h.deps));
    outputs.push(await receive(h.gateway.completeCheckout('cs_mock_1'), h));
    outputs.push(await receive(h.gateway.failPayment('sub_mock_1'), h));
    outputs.push(await getSubscription({ userId, clock: h.clock }, h.deps));
    outputs.push(await openPortal({ userId }, h.deps));
    const stranger = h.gateway.createEvent('customer.subscription.updated', {
      id: 'sub_mock_1',
      customer: 'cus_mock_404',
      metadata: {},
    });
    outputs.push(await receive(stranger, h));

    const text = `${h.logs.text()}\n${JSON.stringify(outputs.map((out) => JSON.stringify(out)))}`;
    for (const forbidden of [
      'cus_mock_1',
      'sub_mock_1',
      'cus_mock_404',
      h.webhookKey,
      'whsec_',
      'sk_live_',
      'sk_test_',
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    // The masked form is what the logs keep.
    expect(h.logs.text()).toContain('cus_…ck_1');
  });
});

describe('[SPEC-210] passerelle Stripe réelle (SDK, sans réseau)', () => {
  const apiKey = ['sk', 'test', randomBytes(12).toString('hex')].join('_');
  const webhookKey = `whsec_${randomBytes(16).toString('hex')}`;
  const config = {
    ...resolveBillingConfig({ STRIPE_MODE: 'test', APP_ENV: 'test' }),
    secretKey: apiKey,
    webhookSecret: webhookKey,
    priceId: 'price_test',
  };
  const gateway = new StripeSdkGateway(config);
  const stripe = new Stripe(apiKey);
  const now = new Date('2026-11-11T12:20:00Z');
  const payload = JSON.stringify({
    id: 'evt_sdk_1',
    object: 'event',
    type: 'customer.subscription.deleted',
    created: Math.floor(now.getTime() / 1000),
    data: { object: { id: 'sub_sdk_1', customer: 'cus_sdk_1', metadata: { userId: 'u-1' } } },
  });
  const header = (at: Date, body = payload) =>
    stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: webhookKey,
      timestamp: Math.floor(at.getTime() / 1000),
    });

  it('CA-2 — vérifie la signature avec le SDK, à l’horloge injectée, tolérance 300 s', () => {
    const event = gateway.constructEvent(payload, header(now), now);
    expect(event).toMatchObject({
      id: 'evt_sdk_1',
      type: 'customer.subscription.deleted',
      userId: 'u-1',
      customerId: 'cus_sdk_1',
      subscriptionId: 'sub_sdk_1',
    });
    const code = (fn: () => unknown): string | undefined => {
      try {
        fn();
      } catch (error) {
        return error instanceof AppError ? error.code : 'autre';
      }
      return undefined;
    };
    expect(
      code(() => gateway.constructEvent(payload, header(new Date(now.getTime() - 301_000)), now)),
    ).toBe('INVALID_SIGNATURE');
    expect(code(() => gateway.constructEvent(`${payload} `, header(now), now))).toBe(
      'INVALID_SIGNATURE',
    );
    expect(code(() => gateway.constructEvent(payload, null, now))).toBe('INVALID_SIGNATURE');
  });
});

const liveKeys = process.env.STRIPE_MODE === 'test' && process.env.STRIPE_SECRET_KEY !== undefined;

describe.skipIf(!liveKeys)(
  '[SPEC-210] Stripe en mode test (réseau) — ignoré : clés de test Stripe absentes',
  () => {
    it('crée un client et une session Checkout puis nettoie', async () => {
      const config = resolveBillingConfig(process.env);
      const gateway = new StripeSdkGateway(config);
      const userId = randomUUID();
      const customer = await gateway.createCustomer({
        userId,
        email: null,
        idempotencyKey: `customer:${userId}`,
      });
      const session = await gateway.createCheckoutSession({
        customerId: customer.id,
        userId,
        successUrl: `${config.appUrl}/ok`,
        cancelUrl: `${config.appUrl}/ko`,
        successPath: '/ok',
        cancelPath: '/ko',
        idempotencyKey: `checkout:${userId}:${randomUUID()}`,
      });
      expect(session.url.startsWith('https://checkout.stripe.com/')).toBe(true);
      await new Stripe(config.secretKey ?? '').customers.del(customer.id);
    });
  },
);
