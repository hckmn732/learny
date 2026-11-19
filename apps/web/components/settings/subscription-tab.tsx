'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { SubscriptionStatus } from '@learny/contracts/billing';
import { formatUserDate } from '@learny/core';
import { Badge, Button, Card, ErrorState, SkeletonGroup } from '@learny/ui';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr/settings';

const t = fr.settings.subscriptionTab;

function statusTone(status: SubscriptionStatus): 'green' | 'orange' | 'neutral' {
  if (status === 'none') return 'green';
  if (status === 'active') return 'green';
  if (status === 'past_due' || status === 'incomplete') return 'orange';
  return 'neutral';
}

/**
 * SCR-15, onglet Abonnement — droit d'utiliser l'application, gratuit par défaut (ADR-0340). Aucune
 * notion d'IA : la plateforme ne fournit aucun modèle. Le portail Stripe est ouvert par le serveur,
 * jamais avec une clé côté client.
 */
export function SubscriptionTab({
  timeZone,
  requestId,
}: Readonly<{ timeZone: string; requestId?: string }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscription = useQuery({
    queryKey: ['billing-subscription'],
    queryFn: () => api.billingSubscription({}),
    retry: false,
  });

  if (subscription.isPending) {
    return (
      <Card as="section" data-testid="subscription-panel" aria-busy="true">
        <SkeletonGroup label={t.loading}>
          <div className="h-64" />
        </SkeletonGroup>
      </Card>
    );
  }

  if (subscription.isError) {
    const request =
      requestId ??
      (subscription.error instanceof ApiError ? subscription.error.requestId : undefined);
    return (
      <Card as="section" data-testid="subscription-panel">
        <ErrorState
          data-testid="subscription-error"
          title={t.errorTitle}
          {...(request === undefined ? {} : { requestId: request })}
          onRetry={() => {
            void subscription.refetch();
          }}
        />
      </Card>
    );
  }

  const state = subscription.data;
  const free = state.status === 'none';
  const periodEnd =
    state.currentPeriodEnd === null
      ? null
      : formatUserDate(state.currentPeriodEnd, timeZone, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

  const openPortal = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.billingPortal({});
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.actionError);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-24" data-testid="subscription-panel">
      <Card as="section" className="flex flex-col gap-16" data-testid="subscription-plan">
        <div className="flex flex-wrap items-start justify-between gap-12">
          <div className="flex flex-col gap-4">
            <h2 className="m-0 font-display text-22 font-600 tracking-title">{t.title}</h2>
            <p className="m-0 text-14 text-ink-muted">{t.description}</p>
          </div>
          <Badge data-testid="subscription-status" tone={statusTone(state.status)}>
            {t.statuses[state.status]}
          </Badge>
        </div>

        <p className="m-0 text-14 text-ink-secondary" data-testid="subscription-summary">
          {free ? t.freeSummary : t.paidSummary}
        </p>

        {periodEnd === null ? null : (
          <p className="m-0 text-14 text-ink-secondary" data-testid="subscription-period">
            {t.periodEnd(periodEnd)}
          </p>
        )}

        {free ? null : (
          <div className="flex flex-wrap items-center gap-12">
            <Button
              data-testid="subscription-portal"
              disabled={busy}
              onClick={() => {
                void openPortal();
              }}
              variant="outline"
            >
              {t.manage}
            </Button>
          </div>
        )}

        {error === null ? null : (
          <p
            className="m-0 text-14 font-600 text-orange-ink"
            data-testid="subscription-action-error"
          >
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}
