import { describe, expect, it, vi } from 'vitest';

import {
  managedAiAvailability,
  managedAiCapState,
  type AiProviderCard,
  type AiUsageOutput,
  type SubscriptionOutput,
} from '@learny/contracts';
import { AppError, ok } from '@learny/core';

import {
  buildManagedAiState,
  hasQualifiedPersonalKey,
  loadManagedAiState,
  manageManagedAi,
  managedAiCap,
  subscribeToManagedAi,
} from './abonnement-a-l-ia-fournie-interface-et-plafond';
import type { ServiceContext } from './context';

const NOW = '2026-11-11T12:20:00.000Z';

function provider(
  status: AiProviderCard['status'],
  origin: AiProviderCard['origin'] = 'personal',
): AiProviderCard {
  const personal = origin === 'personal';
  return {
    id: personal ? '11111111-1111-4111-8111-111111111111' : null,
    origin,
    provider: personal ? 'openai' : 'anthropic',
    providerLabel: personal ? 'OpenAI' : 'Anthropic',
    label: personal ? 'OpenAI' : 'Anthropic · Claude',
    keyMasked: personal ? 'sk-••••••••a91F' : null,
    status,
    outsideEu: personal,
    dataNote: 'Données traitées selon la politique du fournisseur.',
    models: personal ? ['gpt-5.5'] : ['claude-sonnet'],
    qualifiedAt: status === 'qualified' ? NOW : null,
    failure: null,
  };
}

function subscription(overrides: Partial<SubscriptionOutput> = {}): SubscriptionOutput {
  return {
    status: 'none',
    currentPeriodEnd: null,
    hasManagedAi: false,
    dailyCapUsd: 1.5,
    ...overrides,
  };
}

function usage(overrides: Partial<AiUsageOutput> = {}): AiUsageOutput {
  return {
    day: '2026-11-11',
    timezone: 'Europe/Paris',
    spentUsd: '0.000000',
    capUsd: '1.500000',
    percentUsed: 0,
    alertThresholdPercent: 80,
    alert: false,
    resetsAt: '2026-11-11T23:00:00.000Z',
    history: [],
    ...overrides,
  };
}

const ctx = {} as ServiceContext;

describe('[SPEC-725] règles et calculs', () => {
  it('CA-1 — une clé qualifiée ouvre les tâches sans abonnement ; sans les deux, l’IA est indisponible', () => {
    expect(managedAiAvailability({ hasManagedAi: true, hasQualifiedPersonalKey: false })).toBe(
      'managed',
    );
    expect(managedAiAvailability({ hasManagedAi: false, hasQualifiedPersonalKey: true })).toBe(
      'personal',
    );
    expect(managedAiAvailability({ hasManagedAi: false, hasQualifiedPersonalKey: false })).toBe(
      'unavailable',
    );
    expect(hasQualifiedPersonalKey([provider('qualified')])).toBe(true);
    expect(
      hasQualifiedPersonalKey([provider('qualified', 'provided'), provider('unqualified')]),
    ).toBe(false);
  });

  it('CA-2 — l’alerte suit le seuil configuré et le plafond bascule à 100 %', () => {
    expect(managedAiCapState({ percentUsed: 79, alert: false, alertThresholdPercent: 80 })).toBe(
      'normal',
    );
    expect(managedAiCapState({ percentUsed: 80, alert: false, alertThresholdPercent: 80 })).toBe(
      'alert',
    );
    expect(managedAiCapState({ percentUsed: 80.1, alert: true, alertThresholdPercent: 80 })).toBe(
      'alert',
    );
    expect(managedAiCapState({ percentUsed: 100, alert: true, alertThresholdPercent: 80 })).toBe(
      'reached',
    );
    expect(managedAiCap(usage({ percentUsed: 120 }))).toBe('reached');
  });

  it('CA-2 — la consommation et la remise à zéro viennent de /me/ai/usage, jamais du navigateur', () => {
    const state = buildManagedAiState({
      subscription: subscription({ status: 'active', hasManagedAi: true }),
      usage: usage({ spentUsd: '1.200000', percentUsed: 80, alert: true }),
      hasQualifiedPersonalKey: false,
    });
    expect(state.availability).toBe('managed');
    expect(state.usage.spentUsd).toBe('1.200000');
    expect(state.usage.resetsAt).toBe('2026-11-11T23:00:00.000Z');
    expect(managedAiCap(state.usage)).toBe('alert');
  });

  it('ET-3 — le service lit l’abonnement et l’usage en parallèle et compose le même état', async () => {
    const subscriptionFn = vi.fn(() =>
      Promise.resolve(subscription({ status: 'active', hasManagedAi: true })),
    );
    const usageFn = vi.fn(() => Promise.resolve(ok(usage({ percentUsed: 42 }))));
    const result = await loadManagedAiState(
      ctx,
      { hasQualifiedPersonalKey: false },
      { subscription: subscriptionFn, usage: usageFn },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.availability).toBe('managed');
      expect(result.value.usage.percentUsed).toBe(42);
    }
    expect(subscriptionFn).toHaveBeenCalledOnce();
    expect(usageFn).toHaveBeenCalledOnce();
  });

  it('ET-3 — un échec de l’usage ou de l’abonnement est propagé sans inventer d’état', async () => {
    const failure = new AppError('SERVICE_UNAVAILABLE', 'Service indisponible.');
    const usageFailure = await loadManagedAiState(
      ctx,
      { hasQualifiedPersonalKey: false },
      {
        subscription: () => Promise.resolve(subscription()),
        usage: () => Promise.resolve({ ok: false, error: failure }),
      },
    );
    expect(usageFailure.ok).toBe(false);
    if (!usageFailure.ok) expect(usageFailure.error.code).toBe('SERVICE_UNAVAILABLE');

    const subscriptionFailure = await loadManagedAiState(
      ctx,
      { hasQualifiedPersonalKey: false },
      {
        subscription: () => {
          throw failure;
        },
        usage: () => Promise.resolve(ok(usage())),
      },
    );
    expect(subscriptionFailure.ok).toBe(false);
  });

  it('EF-1 — Checkout et portail délèguent au service serveur, jamais à une clé côté client', async () => {
    const checkout = vi.fn(() => Promise.resolve({ url: '/billing/checkout/mock' }));
    const portal = vi.fn(() => Promise.resolve({ url: '/billing/portal/mock' }));
    const body = { successPath: '/parametres#modeles', cancelPath: '/parametres#modeles' };
    expect(await subscribeToManagedAi(ctx, body, { checkout })).toEqual({
      url: '/billing/checkout/mock',
    });
    expect(await manageManagedAi(ctx, { portal })).toEqual({ url: '/billing/portal/mock' });
    expect(checkout).toHaveBeenCalledWith(ctx, body);
    expect(portal).toHaveBeenCalledWith(ctx);
  });
});
