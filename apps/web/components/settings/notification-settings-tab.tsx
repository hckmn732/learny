'use client';

import { useCallback, useState } from 'react';

import {
  type NotificationSettingsDto,
  type NotificationSettingsPatch,
  type NotificationTypeId,
} from '@learny/contracts';
import { Button, Card, ErrorState, FormError, Select, Switch } from '@learny/ui';

import { ApiError, api } from '../../lib/api-client';
import { createPushGateway } from '../../lib/push-onboarding';
import { fr } from '../../messages/fr';

const t = fr.settings.notificationsTab;

const TYPE_LABELS = t.types;

/** BR-SET-03 — the six rows of « Ce qui vous est notifié », in mockup order. */
const TYPE_ROWS: readonly { id: NotificationTypeId; dot: string; recommended: boolean }[] = [
  { id: 'revision', dot: 'bg-violet-ink', recommended: true },
  { id: 'validation', dot: 'bg-orange', recommended: false },
  { id: 'course', dot: 'bg-green', recommended: false },
  { id: 'gap', dot: 'bg-orange-ink-alt', recommended: false },
  { id: 'planning', dot: 'bg-indigo', recommended: false },
  { id: 'relaunch', dot: 'bg-ink-muted', recommended: false },
];

const DIGEST_OPTIONS = ['07:30', '08:00', '08:30', '09:00'] as const;
const QUIET_START_OPTIONS = ['20:00', '21:00', '22:00'] as const;
const QUIET_END_OPTIONS = ['07:00', '08:00', '09:00'] as const;

function withCurrent(
  options: readonly string[],
  current: string,
): { value: string; label: string }[] {
  const values = options.includes(current) ? options : [current, ...options];
  return values.map((value) => ({ value, label: value }));
}

export interface NotificationSettingsTabProps {
  initial: NotificationSettingsDto | null;
  initialError: boolean;
  /** Address shown under the e-mail channel, read from the profile (BR-ACC-12). */
  email: string;
  /** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; the browser channel stays inert without it (CL-3). */
  publicKey: string | undefined;
  requestId?: string;
}

/** SCR-15, onglet Notifications — canaux, six types, quand (SPEC-708 EF-1 to EF-3). */
export function NotificationSettingsTab({
  initial,
  initialError,
  email,
  publicKey,
  requestId,
}: NotificationSettingsTabProps) {
  const [settings, setSettings] = useState<NotificationSettingsDto | null>(initial);
  const [error, setError] = useState<string | null>(initialError ? t.errorTitle : null);
  const [pending, setPending] = useState<string | null>(null);
  const [lastPatch, setLastPatch] = useState<NotificationSettingsPatch | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refetch = useCallback(async (): Promise<void> => {
    try {
      const next = await api.meNotificationSettingsGet({});
      setSettings(next);
      setError(null);
      setLastPatch(null);
    } catch {
      setError(t.errorTitle);
    }
  }, []);

  /**
   * CL-4 — every control is written immediately. On a network failure the server state is read
   * again and the optimistic value is discarded: the counter never lies, and « Réessayer » replays
   * the same patch. The route is idempotent, so a replay never duplicates a write.
   */
  const persist = useCallback(
    async (patch: NotificationSettingsPatch, key: string): Promise<void> => {
      if (pending !== null) return;
      setPending(key);
      setError(null);
      setStatus(null);
      try {
        const next = await api.meNotificationSettingsUpdate({ body: patch });
        setSettings(next);
        setLastPatch(null);
        setStatus('Réglages enregistrés.');
      } catch (cause) {
        try {
          const current = await api.meNotificationSettingsGet({});
          setSettings(current);
        } catch {
          // The current state stays on screen; the error and the retry remain available.
        }
        setError(cause instanceof ApiError ? cause.detail : t.saveError);
        setLastPatch(patch);
      } finally {
        setPending(null);
      }
    },
    [pending],
  );

  const retry = (): void => {
    if (lastPatch !== null) void persist(lastPatch, 'retry');
  };

  const changeBrowser = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      await persist({ channels: { browser: false } }, 'channel-browser');
      return;
    }
    // ET-5, EF-1 — the permission is asked only after the click and only through SPEC-205.
    const gateway = createPushGateway(publicKey);
    if (!gateway.supported) {
      setError(t.browserUnavailable);
      return;
    }
    if (gateway.permission() === 'denied') {
      setError(t.browserDenied);
      return;
    }
    setPending('channel-browser');
    setError(null);
    try {
      const granted = await gateway.subscribe();
      if (!granted) {
        setError(gateway.permission() === 'denied' ? t.browserDenied : t.browserUnavailable);
        return;
      }
      const next = await api.meNotificationSettingsUpdate({
        body: { channels: { browser: true } },
      });
      setSettings(next);
      setLastPatch(null);
      setStatus('Réglages enregistrés.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.saveError);
    } finally {
      setPending(null);
    }
  };

  if (settings === null) {
    return (
      <Card as="section" data-testid="notification-settings-panel">
        {error === null ? (
          <p className="m-0 text-14 text-ink-muted" data-testid="notification-settings-loading">
            {t.loading}
          </p>
        ) : (
          <ErrorState
            data-testid="notification-settings-error-state"
            title={error}
            {...(requestId === undefined ? {} : { requestId })}
            onRetry={() => {
              void refetch();
            }}
          />
        )}
      </Card>
    );
  }

  const disabled = pending !== null;

  return (
    <div className="flex flex-col gap-24">
      <Card className="flex flex-col gap-14" data-testid="notification-channels">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-18 font-600">{t.channelsTitle}</h2>
          <p className="m-0 text-13 text-ink-muted">{t.channelsDescription}</p>
        </div>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-10 p-0">
          <li className="flex items-center justify-between gap-12 rounded-16 bg-surface-subtle px-16 py-14">
            <span className="flex flex-col gap-2">
              <span className="text-14 font-700">{t.channels.app.label}</span>
              <span className="text-12 text-ink-muted">{t.channels.app.description}</span>
            </span>
            <Switch
              aria-label={t.channels.app.label}
              checked
              data-testid="notification-channel-app"
              locked
              onCheckedChange={() => undefined}
            />
          </li>
          <li className="flex items-center justify-between gap-12 rounded-16 bg-surface-subtle px-16 py-14">
            <span className="flex min-w-0 flex-col gap-2">
              <span className="text-14 font-700">{t.channels.email.label}</span>
              <span className="truncate text-12 text-ink-muted">{email}</span>
            </span>
            <Switch
              aria-label={t.channels.email.label}
              checked={settings.channels.email}
              data-testid="notification-channel-email"
              disabled={disabled}
              onCheckedChange={(checked) => {
                void persist({ channels: { email: checked } }, 'channel-email');
              }}
            />
          </li>
          <li className="flex items-center justify-between gap-12 rounded-16 bg-surface-subtle px-16 py-14">
            <span className="flex flex-col gap-2">
              <span className="text-14 font-700">{t.channels.browser.label}</span>
              <span className="text-12 text-ink-muted">{t.channels.browser.description}</span>
            </span>
            <Switch
              aria-label={t.channels.browser.label}
              checked={settings.channels.browser}
              data-testid="notification-channel-browser"
              disabled={disabled}
              onCheckedChange={(checked) => {
                void changeBrowser(checked);
              }}
            />
          </li>
        </ul>
      </Card>

      <Card className="flex flex-col gap-6" data-testid="notification-types">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-8">
          <div className="flex flex-col gap-2">
            <h2 className="m-0 text-18 font-600">{t.typesTitle}</h2>
            <p className="m-0 text-13 text-ink-muted">{t.typesDescription}</p>
          </div>
          <span
            aria-live="polite"
            className="text-13 font-600 text-ink-secondary"
            data-testid="notification-type-count"
          >
            {t.typeCount(settings.activeTypeCount)}
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col p-0">
          {TYPE_ROWS.map((row) => {
            const label = TYPE_LABELS[row.id];
            return (
              <li
                className="flex items-center gap-14 border-t border-solid border-divider px-4 py-12"
                key={row.id}
              >
                <span aria-hidden className={`size-10 shrink-0 rounded-full ${row.dot}`} />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="text-14 font-700">{label.label}</span>
                  <span className="text-13 text-ink-muted">{label.description}</span>
                </span>
                {row.recommended ? (
                  <span className="rounded-full bg-lime-softer px-8 py-3 text-11 font-700 text-lime-ink-strong">
                    {t.recommended}
                  </span>
                ) : null}
                <Switch
                  aria-label={label.label}
                  checked={settings.types[row.id]}
                  data-testid={`notification-type-${row.id}`}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    void persist({ types: { [row.id]: checked } }, `type-${row.id}`);
                  }}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="flex flex-col gap-16" data-testid="quiet-hours">
        <div className="flex flex-col gap-2">
          <h2 className="m-0 text-18 font-600">{t.whenTitle}</h2>
          <p className="m-0 text-13 text-ink-muted">{t.whenDescription}</p>
        </div>
        <div className="flex flex-wrap items-end gap-x-28 gap-y-16">
          <Select
            className="w-[196px]"
            data-testid="notification-digest"
            disabled={disabled}
            label={t.digestLabel}
            onChange={(event) => {
              void persist({ digestTime: event.target.value }, 'digest');
            }}
            options={withCurrent(DIGEST_OPTIONS, settings.digestTime)}
            value={settings.digestTime}
          />
          <Select
            className="w-[116px]"
            data-testid="quiet-hours-start"
            disabled={disabled}
            label={t.quietStartLabel}
            onChange={(event) => {
              void persist({ quietStart: event.target.value }, 'quiet-start');
            }}
            options={withCurrent(QUIET_START_OPTIONS, settings.quiet.start)}
            value={settings.quiet.start}
          />
          <Select
            className="w-[116px]"
            data-testid="quiet-hours-end"
            disabled={disabled}
            label={t.quietEndLabel}
            onChange={(event) => {
              void persist({ quietEnd: event.target.value }, 'quiet-end');
            }}
            options={withCurrent(QUIET_END_OPTIONS, settings.quiet.end)}
            value={settings.quiet.end}
          />
          <div className="flex min-h-44 items-center gap-12" data-testid="weekend-rule">
            <Switch
              aria-label={t.weekendLabel}
              checked={settings.weekendQuiet}
              data-testid="weekend-rule-switch"
              disabled={disabled}
              onCheckedChange={(checked) => {
                void persist({ weekendQuiet: checked }, 'weekend');
              }}
            />
            <span className="text-14 font-600">{t.weekendLabel}</span>
          </div>
        </div>
        {settings.quiet.empty ? (
          <p className="m-0 text-13 font-600 text-ink-secondary" data-testid="quiet-hours-empty">
            {t.quietEmpty}
          </p>
        ) : null}
      </Card>

      {error === null ? null : (
        <div className="flex flex-wrap items-center justify-end gap-12">
          <FormError data-testid="notification-settings-error">{error}</FormError>
          {lastPatch === null ? null : (
            <Button
              data-testid="notification-settings-retry"
              onClick={retry}
              size="sm"
              variant="outline"
            >
              {t.retry}
            </Button>
          )}
        </div>
      )}
      <p aria-live="polite" className="sr-only" data-testid="notification-settings-status">
        {status}
      </p>
    </div>
  );
}
