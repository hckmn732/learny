'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  managedAiAvailability,
  managedAiAvailabilityReason,
  managedAiCapState,
  type ManagedAiAvailability,
} from '@learny/contracts/abonnement-a-l-ia-fournie-interface-et-plafond';
import type { AiProviderCard } from '@learny/contracts/parametres-modeles-d-ia';
import { formatUserDate } from '@learny/core';
import { fr } from '@learny/i18n/fr/settings';
import { Badge, Button, Card, ErrorState, SkeletonGroup } from '@learny/ui';

import { ApiError, api } from '../../lib/api-client';

const t = fr.settings.aiModels.managed;

function formatUsd(amount: string): string {
  const value = Number(amount);
  return `${(Number.isFinite(value) ? value : 0).toFixed(2).replace('.', ',')} $`;
}

function badgeTone(availability: ManagedAiAvailability): 'green' | 'orange' | 'neutral' {
  if (availability === 'managed') return 'green';
  if (availability === 'personal') return 'neutral';
  return 'orange';
}

function availabilityLabel(availability: ManagedAiAvailability): string {
  if (availability === 'managed') return t.badges.managed;
  if (availability === 'personal') return t.badges.personal;
  return t.badges.unavailable;
}

/**
 * EF-1 to EF-4 — hosted AI subscription and daily cap of SCR-15 (SPEC-725, BR-SET-06, BR-IA-06,
 * BR-IA-07). The two reads are the ones of SPEC-210 and SPEC-507; Checkout and the portal are
 * opened by the server, never with a client-side Stripe key.
 */
export function ManagedAiBlock({
  providers,
  requestId,
}: Readonly<{ providers: readonly AiProviderCard[]; requestId?: string }>) {
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subscription = useQuery({
    queryKey: ['billing-subscription'],
    queryFn: () => api.billingSubscription({}),
    retry: false,
  });
  const usage = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => api.aiUsage({ query: {} }),
    retry: false,
  });

  if (subscription.isPending || usage.isPending) {
    return (
      <Card as="section" data-testid="managed-ai-subscription" aria-busy="true">
        <SkeletonGroup label={t.loading}>
          <div className="h-64" />
        </SkeletonGroup>
      </Card>
    );
  }

  if (subscription.isError || usage.isError) {
    const request =
      requestId ??
      (subscription.error instanceof ApiError ? subscription.error.requestId : undefined);
    return (
      <Card as="section" data-testid="managed-ai-subscription">
        <ErrorState
          data-testid="managed-ai-error"
          title={t.errorTitle}
          {...(request === undefined ? {} : { requestId: request })}
          onRetry={() => {
            void Promise.all([subscription.refetch(), usage.refetch()]);
          }}
        />
      </Card>
    );
  }

  const state = subscription.data;
  const usageState = usage.data;
  const hasQualifiedPersonalKey = providers.some(
    (provider) => provider.origin === 'personal' && provider.status === 'qualified',
  );
  const availability = managedAiAvailability({
    hasManagedAi: state.hasManagedAi,
    hasQualifiedPersonalKey,
  });
  const reason = managedAiAvailabilityReason({
    hasManagedAi: state.hasManagedAi,
    hasQualifiedPersonalKey,
  });
  const cap = managedAiCapState(usageState);
  const percent = Math.min(100, Math.round(usageState.percentUsed));
  const resetsAt = formatUserDate(usageState.resetsAt, usageState.timezone, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const open = async (kind: 'checkout' | 'portal'): Promise<void> => {
    if (busy !== null) return;
    setBusy(kind);
    setError(null);
    try {
      const result =
        kind === 'checkout'
          ? await api.billingCheckout({
              body: { successPath: '/parametres#modeles', cancelPath: '/parametres#modeles' },
            })
          : await api.billingPortal({});
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.actionError);
      setBusy(null);
    }
  };

  return (
    <Card as="section" className="flex flex-col gap-16" data-testid="managed-ai-subscription">
      <div className="flex flex-wrap items-start justify-between gap-12">
        <div className="flex flex-col gap-4">
          <h2 className="m-0 font-display text-22 font-600 tracking-title">{t.title}</h2>
          <p className="m-0 text-14 text-ink-muted">{t.description}</p>
        </div>
        <Badge data-testid="managed-ai-status" tone={badgeTone(availability)}>
          {availabilityLabel(availability)}
        </Badge>
      </div>

      <p className="m-0 text-14 text-ink-secondary" data-testid="managed-ai-reason">
        {t.reasons[reason]}
      </p>

      {availability === 'unavailable' ? (
        <p
          className="m-0 rounded-12 bg-orange-soft px-14 py-10 text-14 font-600 text-orange-ink"
          data-testid="managed-ai-unavailable"
          role="status"
        >
          {t.unavailable}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-12">
        <div className="flex flex-col gap-2">
          <span className="text-13 font-700">{t.capTitle}</span>
          <span className="text-14 text-ink-secondary" data-testid="managed-ai-usage">
            {t.capUsage(formatUsd(usageState.spentUsd), formatUsd(usageState.capUsd))}
          </span>
        </div>
        {state.hasManagedAi ? (
          <Button
            data-testid="managed-ai-portal"
            disabled={busy !== null}
            onClick={() => void open('portal')}
            variant="outline"
          >
            {t.manage}
          </Button>
        ) : (
          <Button
            data-testid="managed-ai-subscribe"
            disabled={busy !== null}
            onClick={() => void open('checkout')}
            variant="dark"
          >
            {t.subscribe}
          </Button>
        )}
      </div>

      <div
        aria-label={t.capGaugeLabel}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-10 w-full overflow-hidden rounded-full bg-canvas"
        data-testid="managed-ai-gauge"
        role="progressbar"
      >
        <span
          aria-hidden="true"
          className={cap === 'normal' ? 'block h-full bg-lime' : 'block h-full bg-orange'}
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      <p className="m-0 text-12 text-ink-muted">{t.capPercent(percent)}</p>

      {cap === 'alert' ? (
        <p
          className="m-0 rounded-12 bg-orange-soft px-14 py-10 text-14 font-600 text-orange-ink"
          data-testid="managed-ai-cap-alert"
          role="status"
        >
          {t.alert(usageState.alertThresholdPercent)}
        </p>
      ) : null}

      {cap === 'reached' ? (
        <p
          className="m-0 rounded-12 bg-orange-soft px-14 py-10 text-14 text-orange-ink"
          data-testid="managed-ai-cap-reached"
          role="status"
        >
          {t.reached(resetsAt)}
        </p>
      ) : null}

      {error === null ? null : (
        <p className="m-0 text-14 font-600 text-orange-ink" data-testid="managed-ai-action-error">
          {error}
        </p>
      )}
    </Card>
  );
}
