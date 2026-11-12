import { createHmac, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SubscriptionStatus, isSafeRelativePath, CheckoutBody } from '@learny/contracts';
import { AppError } from '@learny/core';

import { isManagedAiEntitled } from './entitlement';
import { isKnownStripeStatus, mapStripeStatus, maskStripeId } from './status';
import { normalizeStripeEvent, signPayload, verifySignature } from './stripe-event';

const NOW = new Date('2026-11-11T12:20:00Z');
const FUTURE = new Date('2026-12-11T12:20:00Z');
const PAST = new Date('2026-11-11T12:19:59Z');

describe('[SPEC-210] statuts et droit', () => {
  it('EF-5 — correspondance des statuts Stripe (ADR-0215)', () => {
    const expected: Record<string, string> = {
      active: 'active',
      trialing: 'active',
      past_due: 'past_due',
      unpaid: 'past_due',
      canceled: 'canceled',
      incomplete_expired: 'canceled',
      incomplete: 'incomplete',
    };
    for (const [stripe, ours] of Object.entries(expected)) {
      expect(mapStripeStatus(stripe), stripe).toBe(ours);
      expect(SubscriptionStatus.safeParse(mapStripeStatus(stripe)).success).toBe(true);
      expect(isKnownStripeStatus(stripe)).toBe(true);
    }
  });

  it('un statut inconnu ne donne aucun droit (échec fermé)', () => {
    expect(mapStripeStatus('quelque_chose_de_nouveau')).toBe('incomplete');
    expect(isKnownStripeStatus('quelque_chose_de_nouveau')).toBe(false);
    expect(mapStripeStatus('paused')).toBe('past_due');
  });

  it('CA-3 — hasManagedAi est vrai seulement pour active avec une période non échue', () => {
    expect(isManagedAiEntitled({ status: 'active', currentPeriodEnd: FUTURE }, NOW)).toBe(true);
    for (const status of ['none', 'past_due', 'incomplete', 'canceled'] as const) {
      expect(isManagedAiEntitled({ status, currentPeriodEnd: FUTURE }, NOW), status).toBe(false);
    }
    expect(isManagedAiEntitled({ status: 'active', currentPeriodEnd: PAST }, NOW)).toBe(false);
    expect(isManagedAiEntitled({ status: 'active', currentPeriodEnd: NOW }, NOW)).toBe(false);
    expect(isManagedAiEntitled({ status: 'active', currentPeriodEnd: null }, NOW)).toBe(false);
    expect(isManagedAiEntitled(null, NOW)).toBe(false);
    expect(isManagedAiEntitled(undefined, NOW)).toBe(false);
  });

  it('CA-4, CL-5 — seuls les chemins internes sont acceptés', () => {
    for (const path of ['/', '/parametres#ia', '/formations/42?tab=a', '/_dev/sdd/SPEC-210']) {
      expect(isSafeRelativePath(path), path).toBe(true);
    }
    for (const path of [
      '',
      'parametres',
      'https://evil.example/x',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/a b',
      '/a\nb',
      `/${'a'.repeat(600)}`,
    ]) {
      expect(isSafeRelativePath(path), path).toBe(false);
    }
    expect(CheckoutBody.safeParse({ successPath: '/ok', cancelPath: '/ko' }).success).toBe(true);
    expect(
      CheckoutBody.safeParse({ successPath: 'https://evil.example', cancelPath: '/ko' }).success,
    ).toBe(false);
    expect(CheckoutBody.safeParse({ successPath: '//evil', cancelPath: '/ko' }).success).toBe(
      false,
    );
  });

  it('ET-6 — les identifiants Stripe sont masqués sauf les 4 derniers caractères', () => {
    expect(maskStripeId('cus_1AbCdEfGh2345')).toBe('cus_…2345');
    expect(maskStripeId('sub_mock_12')).toBe('sub_…k_12');
    expect(maskStripeId(null)).toBe('—');
    expect(maskStripeId('cus_1AbCdEfGh2345')).not.toContain('1AbCdEfGh');
  });
});

describe('[SPEC-210] signature des webhooks', () => {
  const key = `whsec_${randomBytes(16).toString('hex')}`;
  const payload = JSON.stringify({ id: 'evt_1', type: 'x', created: 1, data: { object: {} } });

  it('accepte une signature valide dans la tolérance de 300 s', () => {
    const header = signPayload(payload, key, NOW);
    expect(() => {
      verifySignature(payload, header, key, NOW);
    }).not.toThrow();
    expect(() => {
      verifySignature(payload, header, key, new Date(NOW.getTime() + 300_000));
    }).not.toThrow();
  });

  it('CL-3 — refuse une signature expirée, altérée ou absente (INVALID_SIGNATURE)', () => {
    const header = signPayload(payload, key, NOW);
    const codeOf = (fn: () => void): string | undefined => {
      try {
        fn();
      } catch (error) {
        return error instanceof AppError ? error.code : 'autre';
      }
      return undefined;
    };
    expect(
      codeOf(() => {
        verifySignature(payload, header, key, new Date(NOW.getTime() + 301_000));
      }),
    ).toBe('INVALID_SIGNATURE');
    expect(
      codeOf(() => {
        verifySignature(`${payload} `, header, key, NOW);
      }),
    ).toBe('INVALID_SIGNATURE');
    expect(
      codeOf(() => {
        verifySignature(payload, header, `whsec_${randomBytes(16).toString('hex')}`, NOW);
      }),
    ).toBe('INVALID_SIGNATURE');
    expect(
      codeOf(() => {
        verifySignature(payload, null, key, NOW);
      }),
    ).toBe('INVALID_SIGNATURE');
    expect(
      codeOf(() => {
        verifySignature(payload, 'v1=abcd', key, NOW);
      }),
    ).toBe('INVALID_SIGNATURE');
  });

  it('le format est celui de Stripe : t=<secondes>,v1=<HMAC-SHA256 de "t.corps">', () => {
    const header = signPayload(payload, key, NOW);
    const timestamp = Math.floor(NOW.getTime() / 1000);
    const digest = createHmac('sha256', key)
      .update(`${String(timestamp)}.${payload}`)
      .digest('hex');
    expect(header).toBe(`t=${String(timestamp)},v1=${digest}`);
  });

  it('lit les identifiants utiles des quatre types traités', () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const raw = (type: string, object: Record<string, unknown>) =>
      normalizeStripeEvent({ id: `evt_${type}`, type, created: 5, data: { object } });
    expect(
      raw('checkout.session.completed', {
        customer: 'cus_a',
        subscription: 'sub_a',
        metadata: { userId },
      }),
    ).toMatchObject({ userId, customerId: 'cus_a', subscriptionId: 'sub_a' });
    expect(
      raw('customer.subscription.deleted', {
        id: 'sub_b',
        customer: 'cus_b',
        metadata: { userId },
      }),
    ).toMatchObject({ userId, customerId: 'cus_b', subscriptionId: 'sub_b' });
    expect(
      raw('invoice.payment_failed', {
        customer: 'cus_c',
        subscription: 'sub_c',
        subscription_details: { metadata: { userId } },
      }),
    ).toMatchObject({ userId, customerId: 'cus_c', subscriptionId: 'sub_c' });
    expect(() => normalizeStripeEvent({ type: 'x' })).toThrow(AppError);
  });
});
