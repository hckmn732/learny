'use client';

import { useRef, useState } from 'react';

import {
  MOCK_PUSH_OUTCOMES,
  type MockPushOutcome,
  type PushDemoSendOutput,
  type PushSubscriptionBody,
} from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { ApiError, api } from '../../lib/api-client';
import {
  disableBrowserPush,
  enableBrowserPush,
  type BrowserPermission,
  type PushBrowser,
  type PushRegistration,
} from '../../lib/push';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec205;

const buttonClass =
  'rounded-[12px] bg-ink px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';
const PERMISSIONS: BrowserPermission[] = ['default', 'granted', 'denied'];
// Demonstration VAPID public key (uncompressed P-256 point, base64url): used when the environment
// has none, so the simulated `subscribe` receives a key like a real browser would. Not a secret.
const DEMO_PUBLIC_KEY =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

type SubscriptionOutcome = keyof typeof t.subscription.outcomes;

interface Simulation {
  supported: boolean;
  permission: BrowserPermission;
  scenario: MockPushOutcome;
  scope: string;
}

/**
 * EF-7 — a browser whose answers come from the controls of the page: the permission radio is the
 * answer of `requestPermission`, the scenario selects the endpoint of the mock push service. The
 * flow executed is the real `enableBrowserPush` of `lib/push.ts`; no real prompt ever appears.
 */
function simulatedBrowser(
  simulation: Simulation,
  current: { value: PushSubscriptionBody | null },
  counters: { requests: number; answered: BrowserPermission | null },
): PushBrowser {
  const registration: PushRegistration = {
    getSubscription: () => Promise.resolve(current.value),
    subscribe: () => {
      current.value = {
        endpoint: `https://push.mock.learny.test/${simulation.scope}/${simulation.scenario}`,
        expirationTime: null,
        keys: { p256dh: 'BDemoP256dhKey_simulated', auth: 'demoAuthKey' },
      };
      return Promise.resolve(current.value);
    },
    unsubscribe: () => {
      current.value = null;
      return Promise.resolve(true);
    },
  };
  return {
    supported: simulation.supported,
    // The radio is the answer the learner gives to the prompt: until the first explicit click the
    // browser is still in `default`, so `enableBrowserPush` asks exactly once per fresh choice.
    permission: () => counters.answered ?? 'default',
    requestPermission: () => {
      counters.requests += 1;
      counters.answered = simulation.permission;
      return Promise.resolve(simulation.permission);
    },
    register: () => Promise.resolve(registration),
    userAgent: () => 'Navigateur simulé (SPEC-205)',
  };
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) return `${t.subscription.outcomes.error} ${error.code}`;
  return t.subscription.outcomes.error;
}

export default function Spec205Client({ publicKey }: Readonly<{ publicKey: string | undefined }>) {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<BrowserPermission>('default');
  const [scenario, setScenario] = useState<MockPushOutcome>('success');
  const [requests, setRequests] = useState(0);
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sends, setSends] = useState<PushDemoSendOutput[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const current = useRef<{ value: PushSubscriptionBody | null }>({ value: null });
  const counters = useRef<{ requests: number; answered: BrowserPermission | null }>({
    requests: 0,
    answered: null,
  });
  const scope = useRef<string | null>(null);

  const browser = () => {
    // One endpoint scope per page view, drawn in an event handler (never during render).
    scope.current ??= `demo-${crypto.randomUUID().slice(0, 8)}`;
    return simulatedBrowser(
      { supported, permission, scenario, scope: scope.current },
      current.current,
      counters.current,
    );
  };

  async function enable() {
    setBusy(true);
    try {
      const outcome = await enableBrowserPush({
        browser: browser(),
        publicKey: publicKey ?? DEMO_PUBLIC_KEY,
        save: (body) => api.pushSubscriptionsUpsert({ body }),
      });
      setRequests(counters.current.requests);
      const key: SubscriptionOutcome = outcome.state;
      setSubscribed(outcome.state === 'subscribed');
      setMessage(t.subscription.outcomes[key]);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await disableBrowserPush({
        browser: browser(),
        remove: (endpoint) => api.pushSubscriptionsDelete({ body: { endpoint } }),
      });
      setSubscribed(false);
      setMessage(t.subscription.outcomes.removed);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  async function receive() {
    setSending(true);
    try {
      const result = await api.devPushSend({});
      if (result.remainingSubscriptions === 0) setSubscribed(false);
      setSends((list) => [result, ...list]);
      setAnnouncement(
        t.delivery.announce(
          t.delivery.status[result.delivery.status] ?? result.delivery.status,
          result.remainingSubscriptions,
        ),
      );
    } catch (error) {
      setAnnouncement(describeError(error));
    } finally {
      setSending(false);
    }
  }

  const latest = sends[0];
  const enableDisabled = busy || !supported || subscribed;

  return (
    <>
      <BaseTokenStyle />
      <p data-testid="spec-205-inapp" className="mt-4 text-sm font-semibold">
        {t.inApp}
      </p>

      <BaseCard testId="spec-205-permission" title={t.permission.title}>
        <p className="mb-3 text-sm">{t.permission.intro}</p>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-sm font-semibold">{t.permission.legend}</legend>
          {PERMISSIONS.map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="spec-205-permission"
                value={value}
                checked={permission === value}
                data-testid={`spec-205-permission-${value}`}
                onChange={() => {
                  setPermission(value);
                  // A new simulated answer is a new explicit choice: the next click asks again.
                  counters.current.answered = null;
                  setRequests(counters.current.requests);
                }}
                className="size-4 accent-ink"
              />
              {t.permission.options[value]}
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={!supported}
            aria-label={t.permission.supportLabel}
            data-testid="spec-205-support-switch"
            onClick={() => {
              setSupported((value) => !value);
            }}
            className="relative h-7 w-12 rounded-full border border-solid border-border focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ backgroundColor: supported ? colors.border : colors.ink }}
          >
            <span
              aria-hidden="true"
              className="absolute top-0.5 size-5 rounded-full bg-white"
              style={{ left: supported ? '0.125rem' : '1.5rem' }}
            />
          </button>
          <span className="text-sm">{t.permission.supportLabel}</span>
        </div>
        <p data-testid="spec-205-permission-requests" className="mt-3 text-sm">
          {t.permission.requests(requests)}
        </p>
      </BaseCard>

      <BaseCard testId="spec-205-subscription" title={t.subscription.title}>
        <p className="mb-3 text-sm">{t.subscription.intro}</p>
        <label className="block text-sm">
          <span className="font-semibold">{t.subscription.scenario}</span>
          <select
            data-testid="spec-205-scenario"
            value={scenario}
            disabled={subscribed}
            onChange={(event) => {
              setScenario(event.target.value as MockPushOutcome);
            }}
            className="mt-1 block rounded-[12px] border border-solid border-border bg-white px-3 py-2"
          >
            {MOCK_PUSH_OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {t.subscription.scenarios[value]}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className={buttonClass}
            disabled={enableDisabled}
            aria-describedby={supported ? undefined : 'spec-205-support-missing'}
            onClick={() => void enable()}
          >
            {t.subscription.enable}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={busy || !subscribed}
            onClick={() => void disable()}
          >
            {t.subscription.disable}
          </button>
        </div>
        {supported ? null : (
          <p
            id="spec-205-support-missing"
            data-testid="spec-205-support-missing"
            className="mt-3 text-sm"
          >
            {t.permission.supportMissing}
          </p>
        )}
        <p
          data-testid="spec-205-subscription-state"
          data-state={subscribed ? 'active' : 'none'}
          className="mt-3 text-sm font-semibold"
        >
          {subscribed ? t.subscription.state.active : t.subscription.state.none}
        </p>
        <p
          role="status"
          aria-live="polite"
          data-testid="spec-205-subscription-message"
          className="mt-1 text-sm"
        >
          {message}
        </p>
      </BaseCard>

      <BaseCard testId="spec-205-preview" title={t.preview.title}>
        <p className="mb-3 text-sm">{t.preview.intro}</p>
        <button
          type="button"
          className={buttonClass}
          disabled={sending}
          onClick={() => void receive()}
        >
          {sending ? t.preview.sending : t.preview.receive}
        </button>
        {latest === undefined ? (
          <p data-testid="spec-205-preview-empty" className="mt-4 text-sm">
            {t.preview.empty}
          </p>
        ) : (
          <figure
            data-testid="spec-205-preview-card"
            data-status={latest.delivery.status}
            className="mt-4 flex gap-3 rounded-[16px] border border-solid border-border p-4"
          >
            <span
              aria-hidden="true"
              className="mt-1 inline-block size-8 shrink-0 rounded-full bg-ink"
            />
            <figcaption className="text-sm">
              <span data-testid="spec-205-preview-title" className="block font-semibold">
                {latest.payload.title}
              </span>
              <span data-testid="spec-205-preview-body" className="block">
                {latest.payload.body}
              </span>
              <span data-testid="spec-205-preview-url" className="block text-xs">
                {t.preview.url} {latest.payload.url}
              </span>
              {latest.delivery.status === 'sent' ? null : (
                <span data-testid="spec-205-preview-inapp" className="mt-1 block text-xs">
                  {t.preview.inAppKept}
                </span>
              )}
            </figcaption>
          </figure>
        )}
      </BaseCard>

      <BaseCard testId="spec-205-delivery" title={t.delivery.title}>
        <p className="mb-3 text-sm">{t.delivery.intro}</p>
        <p
          role="status"
          aria-live="polite"
          className="sr-only"
          data-testid="spec-205-delivery-announce"
        >
          {announcement}
        </p>
        {sends.length === 0 ? (
          <p data-testid="spec-205-delivery-empty" className="text-sm">
            {t.delivery.empty}
          </p>
        ) : (
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <caption className="sr-only">{t.delivery.caption}</caption>
            <thead>
              <tr>
                {t.delivery.columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="border-b border-solid border-border py-2 pr-2"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sends.map((send, index) => (
                <tr
                  key={send.notificationId}
                  data-testid={`spec-205-delivery-row-${String(sends.length - index)}`}
                >
                  <th
                    scope="row"
                    className="border-b border-solid border-border py-3 pr-2 align-top font-normal"
                  >
                    {String(sends.length - index)}
                  </th>
                  <td
                    data-testid={`spec-205-delivery-status-${String(sends.length - index)}`}
                    data-status={send.delivery.status}
                    className="break-words border-b border-solid border-border py-3 pr-2 align-top font-semibold"
                  >
                    {t.delivery.status[send.delivery.status] ?? send.delivery.status}
                    {send.delivery.error === null ? null : (
                      <span className="block text-xs font-normal">{send.delivery.error}</span>
                    )}
                  </td>
                  <td className="break-words border-b border-solid border-border py-3 pr-2 align-top">
                    {send.attempts.length === 0
                      ? t.delivery.none
                      : send.attempts.map((attempt, position) => (
                          <span key={String(position)} className="block">
                            {t.delivery.attempt(
                              attempt.outcome,
                              attempt.statusCode,
                              attempt.removed,
                              attempt.failureCount,
                            )}
                          </span>
                        ))}
                  </td>
                  <td className="border-b border-solid border-border py-3 align-top">
                    {String(send.remainingSubscriptions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </BaseCard>
    </>
  );
}
