'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SimulateBody, SubscriptionStatus, WebhookResult } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { ApiError, api } from '../../lib/api-client';
import { qk } from '../../lib/query-keys';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec210;

const RETURN_PATH = '/_dev/sdd/SPEC-210';

const buttonClass =
  'rounded-[12px] bg-ink px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

// Decorative indicators only (SPEC-210 §10): the status is always written out.
const BADGE_COLORS: Record<SubscriptionStatus, string> = {
  none: colors.border,
  active: colors.green,
  past_due: colors.orange,
  canceled: colors.border,
  incomplete: colors.border,
};

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'medium',
});

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return `${error.code} (${String(error.status)})`;
  return String(error);
}

function StatusCard() {
  const subscription = useQuery({
    queryKey: qk.billingSubscription(),
    queryFn: () => api.billingSubscription({}),
  });
  const data = subscription.data;

  return (
    <BaseCard testId="spec-210-status" title={t.status.title} role="status">
      {data === undefined ? (
        <p className="text-sm">{t.status.loading}</p>
      ) : (
        <dl className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <dt className="sr-only">{t.status.title}</dt>
            <dd className="flex items-center gap-2">
              <span
                aria-hidden="true"
                data-testid="spec-210-badge-dot"
                className="inline-block size-3 shrink-0 rounded-full border border-solid border-border"
                style={{ backgroundColor: BADGE_COLORS[data.status] }}
              />
              <span data-testid="spec-210-badge" className="text-lg font-semibold">
                {t.status.labels[data.status]}
              </span>
            </dd>
          </div>
          <div>
            <dd data-testid="spec-210-period">
              {data.currentPeriodEnd === null
                ? t.status.noPeriod
                : t.status.periodEnd(formatDate(data.currentPeriodEnd))}
            </dd>
          </div>
          <div>
            <dd data-testid="spec-210-managed-ai">{t.status.managedAi(data.hasManagedAi)}</dd>
          </div>
        </dl>
      )}
    </BaseCard>
  );
}

function ActionsCard() {
  const queryClient = useQueryClient();
  const subscription = useQuery({
    queryKey: qk.billingSubscription(),
    queryFn: () => api.billingSubscription({}),
  });
  const events = useQuery({
    queryKey: qk.devStripeEvents(),
    queryFn: () => api.devStripeEvents({}),
  });
  const status = subscription.data?.status;

  const subscribe = useMutation({
    mutationFn: () =>
      api.billingCheckout(
        { body: { successPath: RETURN_PATH, cancelPath: RETURN_PATH } },
        { idempotencyKey: crypto.randomUUID() },
      ),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
  const simulate = useMutation({
    mutationFn: (action: SimulateBody['action']) => api.devStripeSimulate({ body: { action } }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.billingSubscription() }),
        queryClient.invalidateQueries({ queryKey: qk.devStripeEvents() }),
      ]);
    },
  });
  const failure = subscribe.error ?? simulate.error;
  const busy = subscribe.isPending || simulate.isPending;

  return (
    <BaseCard testId="spec-210-actions" title={t.actions.title}>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClass}
          disabled={busy || status === undefined || status === 'active'}
          onClick={() => {
            subscribe.mutate();
          }}
        >
          {t.actions.subscribe}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || status !== 'active'}
          onClick={() => {
            simulate.mutate('payment-failed');
          }}
        >
          {t.actions.failPayment}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || (status !== 'active' && status !== 'past_due')}
          onClick={() => {
            simulate.mutate('cancel');
          }}
        >
          {t.actions.cancel}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || (events.data?.items.length ?? 0) === 0}
          onClick={() => {
            simulate.mutate('replay');
          }}
        >
          {t.actions.replay}
        </button>
      </div>
      <div aria-live="polite">
        {failure === null ? null : (
          <p role="alert" className="mt-3 text-sm">
            {`${t.actions.error} ${describeError(failure)}`}
          </p>
        )}
      </div>
    </BaseCard>
  );
}

function resultLabel(result: WebhookResult): string {
  return t.events.results[result];
}

function EventsCard() {
  const events = useQuery({
    queryKey: qk.devStripeEvents(),
    queryFn: () => api.devStripeEvents({}),
  });
  const items = events.data?.items ?? [];

  return (
    <BaseCard testId="spec-210-events" title={t.events.title}>
      <div
        role="region"
        aria-label={t.events.title}
        // Keyboard access to the horizontal scroll of the table on narrow screens (WCAG 2.1.1).
        tabIndex={0}
        className="overflow-x-auto"
      >
        <table data-testid="spec-210-events-table" className="w-full text-left text-sm">
          <thead>
            <tr>
              {t.events.columns.map((column) => (
                <th key={column} scope="col" className="py-1 pr-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.eventId}-${String(index)}`} data-testid="spec-210-event-row">
                <th scope="row" className="py-1 pr-3 font-normal">
                  {item.type}
                </th>
                <td className="py-1 pr-3">{formatDate(item.at)}</td>
                <td className="py-1 pr-3" data-testid="spec-210-event-result">
                  {resultLabel(item.result)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length === 0 ? <p className="mt-2 text-sm">{t.events.empty}</p> : null}
    </BaseCard>
  );
}

export default function Spec210Demo() {
  return (
    <>
      <BaseTokenStyle />
      <StatusCard />
      <ActionsCard />
      <EventsCard />
    </>
  );
}
