// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@learny/api-client';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { SubscriptionTab } from './subscription-tab';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderComponent(
    <QueryClientProvider client={client}>
      <SubscriptionTab timeZone="Europe/Paris" />
    </QueryClientProvider>,
  );
}

describe('[SPEC-725] onglet Abonnement : droit d’usage gratuit par défaut', () => {
  it('sans abonnement : « Gratuit », sans souscription ni notion d’IA', async () => {
    vi.spyOn(api, 'billingSubscription').mockResolvedValue({
      status: 'none',
      currentPeriodEnd: null,
    });
    renderTab();
    expect((await screen.findByTestId('subscription-status')).textContent).toBe('Gratuit');
    expect(screen.getByTestId('subscription-summary').textContent).toContain('Learny est gratuit');
    expect(screen.queryByTestId('subscription-portal')).toBeNull();
    expect(screen.queryByTestId('subscription-period')).toBeNull();
    const panel = screen.getByTestId('subscription-panel').textContent;
    expect(panel).not.toContain('plafond');
    expect(panel).not.toContain('Souscrire');
    expect(panel).not.toContain('IA fournie');
  });

  it('abonnement actif : statut, fin de période et portail Stripe', async () => {
    vi.spyOn(api, 'billingSubscription').mockResolvedValue({
      status: 'active',
      currentPeriodEnd: '2026-12-11T00:00:00.000Z',
    });
    renderTab();
    expect((await screen.findByTestId('subscription-status')).textContent).toBe('Actif');
    expect(screen.getByTestId('subscription-period').textContent).toContain('11 décembre 2026');
    expect(screen.getByTestId('subscription-portal').textContent).toBe('Gérer l’abonnement');
  });

  it('erreur de lecture : état d’erreur avec « Réessayer »', async () => {
    vi.spyOn(api, 'billingSubscription').mockRejectedValue(new Error('réseau'));
    renderTab();
    expect(await screen.findByTestId('subscription-error')).toBeTruthy();
  });
});
